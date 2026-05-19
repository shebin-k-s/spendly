import { GoogleGenerativeAI } from '@google/generative-ai';
import { ApiError } from '../../common/middlewares/error.middleware';

export interface CategoryOption { id: string; name: string; icon: string; }

export class ExpenseAiService {
    private readonly validPaymentMethods = ['upi', 'card', 'cash', 'bank_transfer', 'other'];
    private readonly timeoutMs = 25_000;
    private readonly modelFallbacks = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite"
    ];

    private buildPrompt(categories: CategoryOption[]): string {
        const categoryBlock = categories.length
            ? `Available categories — pick the best fit from this exact list (use the "id").\n${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name, icon: c.icon })))}`
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
  "note": "<any extra useful details (e.g. specific items, addresses). Do NOT include cashback, rewards, or any transaction/reference ID. Max 100 chars, or null>"
}

Rules:
- amount: debit/paid amount only, not balance
- description: Use the merchant name if visible (e.g., 'Swiggy', 'Zomato', 'Amazon', 'Reliance Smart'). Otherwise, summarize the item. Be concise.
- payment_method: GPay/PhonePe/Paytm/UPI → upi, debit/credit card → card
- date/time: only from what is clearly visible
- category_id: Smartly categorize the transaction. CRITICAL: If you see a highly specific category matching the item exactly (like 'Drinks' for a sarbhath/drink purchase) DO NOT put it in a generic bucker (like 'Food & Dining'). ONLY fallback to generic variants (like 'Grocery' instead of 'Chanthavila Grocery') if there's no distinguishing clue whatsoever (like an address or store name).
- note: Extract anything else useful that helps the user remember the purchase.

${categoryBlock}`;
    }

    private isOverloadedError(err: unknown): boolean {
        if (err instanceof Error) {
            const msg = err.message.toLowerCase();
            return msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('resource_exhausted');
        }
        return false;
    }

    async parseReceipt(imageBase64: string, mimeType: string, categories: CategoryOption[], debug: boolean = false) {
        if (!process.env.GEMINI_API_KEY) {
            throw new ApiError('AI parsing not configured', 503);
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = this.buildPrompt(categories);
        const validCategoryIds = new Set(categories.map(c => c.id));
        const t0 = Date.now();
        let lastError: unknown;

        for (const modelName of this.modelFallbacks) {
            const model = genAI.getGenerativeModel({ model: modelName });
            const timeoutP = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new ApiError('AI parsing timed out', 504)), this.timeoutMs)
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
                const payment_method = this.validPaymentMethods.includes(raw.payment_method as string)
                    ? (raw.payment_method as string) : 'upi';
                const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
                    ? raw.date : null;
                const time = typeof raw.time === 'string' && /^\d{2}:\d{2}$/.test(raw.time)
                    ? raw.time : null;
                const category_id = typeof raw.category_id === 'string' && validCategoryIds.has(raw.category_id)
                    ? raw.category_id : null;
                const note = typeof raw.note === 'string' ? raw.note.slice(0, 150).trim() : null;
                const category_name = category_id ? categories.find(c => c.id === category_id)?.name : null;

                const payload: any = { amount, description, payment_method, date, time, category_id, category_name, note };
                if (debug) {
                    payload._debug = { prompt, rawText: text };
                }
                return payload;
            } catch (err) {
                lastError = err;
                const isLast = modelName === this.modelFallbacks[this.modelFallbacks.length - 1];
                if (!isLast) {
                    console.warn(JSON.stringify({
                        level: 'warn', ts: new Date().toISOString(), msg: 'gemini: model unavailable, trying next',
                        failed: modelName, reason: this.isOverloadedError(err) ? 'overloaded' : 'error'
                    }));
                    continue;
                }
                console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg: 'gemini: all models failed', ms: Date.now() - t0 }));
            }
        }
        throw lastError ?? new ApiError('AI parsing failed', 503);
    }
}
