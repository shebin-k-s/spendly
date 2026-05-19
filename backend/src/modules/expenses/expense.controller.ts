import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ApiError } from '../../common/middlewares/error.middleware';
import { ExpenseService } from './expense.service';

const log = {
    info: (msg: string, meta?: Record<string, unknown>) =>
        console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg, ...meta })),
    warn: (msg: string, meta?: Record<string, unknown>) =>
        console.warn(JSON.stringify({ level: 'warn', ts: new Date().toISOString(), msg, ...meta })),
    error: (msg: string, meta?: Record<string, unknown>) =>
        console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg, ...meta })),
};

const service = new ExpenseService();

const GEMINI_PROMPT = `You are an expense parsing assistant. Analyze this UPI payment screenshot and extract expense details.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": "<number as string, e.g. \"1299.00\">",
  "description": "<what the payment was likely for (e.g., 'Food', 'Ice Cream', 'Movie') rather than the merchant name>",
  "payment_method": "<one of: upi, card, cash, bank_transfer, other>",
  "date": "<yyyy-MM-dd or null if not visible>",
  "time": "<HH:mm in 24h format or null if not visible>",
  "category_hint": "<one of: food, transport, shopping, entertainment, health, utilities, education, travel, other>"
}

Rules:
- amount: extract the transaction amount (debit/paid amount), not balance
- description: infer the actual item or service purchased based on the merchant name (e.g., if merchant is Swiggy, description should be 'Food'; if Inox, 'Movie'). Keep it concise, represent the purchase not the merchant (max 30 chars)
- payment_method: if UPI/GPay/PhonePe/Paytm → "upi", if debit/credit card → "card", else "other"
- date/time: only from what is clearly visible in the image
- category_hint: infer from merchant name (e.g. Swiggy/Zomato → food, Uber/Ola → transport)`;

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

async function geminiParseImage(imageBase64: string, mimeType: string): Promise<{
    amount: string;
    description: string;
    payment_method: string;
    date: string | null;
    time: string | null;
    category_hint: string;
}> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
                GEMINI_PROMPT,
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
            const category_hint = typeof raw.category_hint === 'string'
                ? raw.category_hint.toLowerCase() : 'other';

            if (usedFallback) {
                log.warn('gemini: recovered via fallback', { model: modelName, ms: Date.now() - t0 });
            }
            return { amount, description, payment_method, date, time, category_hint };
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
        const parsed = await geminiParseImage(base64, mimeType);
        res.json(parsed);
    };
}
