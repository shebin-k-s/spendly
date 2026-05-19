import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ApiError } from '../../common/middlewares/error.middleware';
import { ExpenseService } from './expense.service';
import { CategoryService } from '../categories/category.service';

const log = {
    info: (msg: string, meta?: Record<string, unknown>) =>
        console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg, ...meta })),
    warn: (msg: string, meta?: Record<string, unknown>) =>
        console.warn(JSON.stringify({ level: 'warn', ts: new Date().toISOString(), msg, ...meta })),
    error: (msg: string, meta?: Record<string, unknown>) =>
        console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg, ...meta })),
};

const service = new ExpenseService();

interface CategoryOption { id: string; name: string; icon: string; }

function buildPrompt(categories: CategoryOption[]): string {
    const categoryBlock = categories.length
        ? `Available categories — pick the best fit from this exact list (use the "id"). If very ambiguous (e.g. multiple Grocery categories), pick the more generic one.\n${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name, icon: c.icon })))}`
        : 'No categories available — use null for category_id.';

    return `You are an expense parsing assistant. Analyze this payment screenshot and extract expense details.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": "<number as string, e.g. \\"1299.00\\">",
  "description": "<merchant name or summary of purchase (e.g. 'Swiggy Order', 'Reliance Groceries', 'Movie Tickets'), max 40 chars>",
  "payment_method": "<upi | card | cash | bank_transfer | other>",
  "date": "<yyyy-MM-dd or null if not visible>",
  "time": "<HH:mm 24h or null if not visible>",
  "category_id": "<exact id string from the list below, or null>",
  "note": "<any extra useful details (e.g. specific items, addresses). Max 100 chars, or null>"
}

Rules:
- amount: debit/paid amount only, not balance
- description: Use the merchant name if visible (e.g., 'Swiggy', 'Zomato', 'Amazon', 'Reliance Smart'). Otherwise, summarize the item. Be concise.
- payment_method: GPay/PhonePe/Paytm/UPI → upi, debit/credit card → card
- date/time: only from what is clearly visible
- category_id: Smartly categorize the transaction. If you see two very similar categories (like 'Grocery' vs 'Chanthavila Grocery') and there is no specific address clue in the receipt, default to the generic one. Only pick specific locations if the receipt has explicit proof of it.
- note: Extract anything else useful that helps the user remember the purchase.

${categoryBlock}`;
}

const VALID_PAYMENT_METHODS = ['upi', 'card', 'cash', 'bank_transfer', 'other'];
const AI_TIMEOUT_MS = 25_000;
const GEMINI_MODEL_FALLBACKS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite"
];
function isOverloadedError(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        return msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('resource_exhausted');
    }
    return false;
}

async function geminiParseImage(imageBase64: string, mimeType: string, categories: CategoryOption[]): Promise<{
    amount: string;
    description: string;
    payment_method: string;
    date: string | null;
    time: string | null;
    category_id: string | null;
    category_name?: string | null;
    note?: string | null;
}> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const prompt = buildPrompt(categories);
    const validCategoryIds = new Set(categories.map(c => c.id));

    const t0 = Date.now();
    let lastError: unknown;
    let usedFallback = false;

    for (const modelName of GEMINI_MODEL_FALLBACKS) {
        const model = genAI.getGenerativeModel({ model: modelName });
        const timeoutP = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new ApiError('AI parsing timed out', 504)), AI_TIMEOUT_MS)
        );
        try {
            const resultP = model.generateContent([
                prompt,
                { inlineData: { data: imageBase64, mimeType } },
            ]);
            const result = await Promise.race([resultP, timeoutP]);

            const text = result.response.text().trim();
            const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

            let raw: Record<string, unknown>;
            try {
                raw = JSON.parse(json);
            } catch {
                throw new ApiError('AI returned an unreadable response', 422);
            }

            const amount = typeof raw.amount === 'string' && /^\d+(\.\d{1,2})?$/.test(raw.amount.trim())
                ? raw.amount.trim() : '';
            const description = typeof raw.description === 'string'
                ? raw.description.slice(0, 50).trim() : '';
            const payment_method = VALID_PAYMENT_METHODS.includes(raw.payment_method as string)
                ? (raw.payment_method as string) : 'upi';
            const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
                ? raw.date : null;
            const time = typeof raw.time === 'string' && /^\d{2}:\d{2}$/.test(raw.time)
                ? raw.time : null;
            const category_id = typeof raw.category_id === 'string' && validCategoryIds.has(raw.category_id)
                ? raw.category_id : null;
            const note = typeof raw.note === 'string' ? raw.note.slice(0, 150).trim() : null;
            const category_name = category_id ? categories.find(c => c.id === category_id)?.name : null;
            log.info('parseImage: ai raw category_id', { raw: raw.category_id, resolved: category_id, name: category_name });

            if (usedFallback) {
                log.warn('gemini: recovered via fallback', { model: modelName, ms: Date.now() - t0 });
            }
            return { amount, description, payment_method, date, time, category_id, category_name, note };
        } catch (err) {
            lastError = err;
            const isLast = modelName === GEMINI_MODEL_FALLBACKS[GEMINI_MODEL_FALLBACKS.length - 1];
            if (!isLast) {
                log.warn('gemini: model unavailable, trying next', { failed: modelName, reason: isOverloadedError(err) ? 'overloaded' : 'error' });
                usedFallback = true;
                continue;
            }
            log.error('gemini: all models failed', { ms: Date.now() - t0 });
        }
    }

    throw lastError ?? new ApiError('AI parsing failed', 503);
}

export class ExpenseController {
    getByMonth = async (req: Request, res: Response) => {
        const year = parseInt(req.query.year as string) || new Date().getFullYear();
        const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
        const categoryId = req.query.categoryId as string | undefined;
        res.json(await service.getByMonth(year, month, categoryId));
    };

    getMonthlySummary = async (req: Request, res: Response) => {
        const year = parseInt(req.query.year as string) || new Date().getFullYear();
        const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
        res.json(await service.getMonthlySummary(year, month));
    };

    getAnalytics = async (req: Request, res: Response) => {
        const months = parseInt(req.query.months as string) || 6;
        res.json(await service.getAnalytics(months));
    };

    getById = async (req: Request, res: Response) => {
        res.json(await service.getById(req.params.id as string));
    };

    create = async (req: Request, res: Response) => {
        res.status(201).json(await service.create(req.body));
    };

    update = async (req: Request, res: Response) => {
        res.json(await service.update(req.params.id as string, req.body));
    };

    delete = async (req: Request, res: Response) => {
        await service.delete(req.params.id as string);
        res.sendStatus(204);
    };

    parseImage = async (req: Request, res: Response) => {
        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) {
            res.status(400).json({ message: 'No image uploaded' });
            return;
        }
        if (!process.env.GEMINI_API_KEY) {
            log.error('gemini: GEMINI_API_KEY not configured');
            res.status(503).json({ message: 'AI parsing not configured' });
            return;
        }
        const base64 = file.buffer.toString('base64');
        const mimeType = file.mimetype || 'image/jpeg';

        let categories: CategoryOption[] = [];
        try {
            const categoryService = new CategoryService();
            const cats = await categoryService.getAll();
            categories = cats.map(c => ({ id: c.id, name: c.name, icon: c.icon }));
        } catch (err) {
            log.error('parseImage: failed to fetch categories', { error: String(err) });
        }

        const parsed = await geminiParseImage(base64, mimeType, categories);
        res.json(parsed);
    };
}
