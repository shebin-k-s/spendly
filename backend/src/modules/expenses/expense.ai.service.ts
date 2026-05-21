import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { ApiError } from '../../common/middlewares/error.middleware';
import { getISTParts } from '../../common/utils/date.utils';

export interface CategoryOption { id: string; name: string; icon: string; }

export class ExpenseAiService {
    private readonly validPaymentMethods = ['upi', 'card', 'cash', 'bank_transfer', 'other'];
    private readonly timeoutMs = 25_000;
    private readonly modelFallbacks = [
        // CURRENT BEST FREE-TIER PRIMARY
        'gemini-2.5-flash',

        // NEWEST STABLE HIGH-VOLUME MODEL
        'gemini-3.1-flash-lite',

        // CHEAP + FAST
        'gemini-2.5-flash-lite',

        // OLDER BUT VERY STABLE
        'gemini-1.5-flash',

        // LIGHTWEIGHT FALLBACK
        'gemini-1.5-flash-8b',

        // LEGACY FALLBACKS (deprecated soon)
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
    ];

    private readonly merchantCategoryHints = [
        { merchant: 'Ayaans Mart', category: 'Chanthavila Grocery' },
    ];
    private genAI: GoogleGenerativeAI | null = null;

    private getGenAI(): GoogleGenerativeAI {
        if (!this.genAI) {
            if (!process.env.GEMINI_API_KEY) {
                throw new ApiError('AI parsing not configured', 503);
            }
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        }
        return this.genAI;
    }

    private buildCommonBlocks(categories: CategoryOption[]) {
        const categoryBlock = categories.length
            ? `Available categories — pick the best fit from this exact list (use the "id").\n${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name, icon: c.icon })))}`
            : 'No categories available — use null for category_id.';

        const merchantHintBlock = `Merchant → preferred category hints (use these if a matching category exists in the list below; otherwise choose the best fit yourself):\n${this.merchantCategoryHints.map(h => `- "${h.merchant}" → prefer category: "${h.category}"`).join('\n')}`;

        return { categoryBlock, merchantHintBlock };
    }

    private buildImagePrompt(categories: CategoryOption[]): string {
        const { categoryBlock, merchantHintBlock } = this.buildCommonBlocks(categories);

        return `You are an expense parsing assistant. Analyze this payment screenshot and extract expense details.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": "<number as string, e.g. \\"1299.00\\">",
  "description": "<merchant name or summary of purchase (e.g. 'Swiggy Order', 'Reliance Groceries', 'Movie Tickets'), max 40 chars>",
  "payment_method": "<upi | card | cash | bank_transfer | other>",
  "date": "<yyyy-MM-dd or null if not visible>",
  "time": "<HH:mm 24h or null if not visible>",
  "category_id": "<exact id string from the list below, or null>",
  "note": "<any extra useful details (e.g. specific items, addresses). Do NOT include cashback, rewards, or any transaction/reference ID. Max 100 chars, or null>",
  "transfer_person": "<full name, phone number, or UPI ID of the individual — ONLY for personal transfers between people. null for merchant/business payments>",
  "transfer_direction": "<sent | received | null — sent if user paid/transferred money out, received if user received money. null if not a personal transfer>"
}

Rules:
- amount: debit/paid amount only, not balance
- description: Use the merchant name if visible (e.g., 'Swiggy', 'Zomato', 'Amazon', 'Reliance Smart'). Otherwise, summarize the item. Be concise.
- payment_method: GPay/PhonePe/Paytm/UPI → upi, debit/credit card → card
- date/time: only from what is clearly visible
- category_id: Smartly categorize the transaction. CRITICAL: If you see a highly specific category matching the item exactly (like 'Drinks' for a sarbhath/drink purchase) DO NOT put it in a generic bucket (like 'Food & Dining'). ONLY fallback to generic variants (like 'Grocery' instead of 'Chanthavila Grocery') if there's no distinguishing clue whatsoever (like an address or store name).
- note: Extract anything else useful that helps the user remember the purchase.
- transfer_person: Extract ONLY when the receipt clearly shows a transfer to/from a named individual (not a business). Full name preferred, else phone or UPI ID.
- transfer_direction: sent = user paid/sent money out; received = user got money in. Always set when transfer_person is set.

${merchantHintBlock}

${categoryBlock}`;
    }

    private buildTextPrompt(text: string, categories: CategoryOption[], today: string, currentTime: string): string {
        const { categoryBlock, merchantHintBlock } = this.buildCommonBlocks(categories);

        return `You are an expense parsing assistant. A user typed a natural language description of something they spent money on. Extract the expense details.

Today's date is ${today} and current time is ${currentTime}.

Input: "${text}"

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": "<number as string e.g. \\"350.00\\", or null if not mentioned>",
  "description": "<merchant name or what was bought, max 40 chars>",
  "payment_method": "<upi | card | cash | bank_transfer | other>",
  "date": "<yyyy-MM-dd or null>",
  "time": "<HH:mm 24h or null>",
  "cashback": "<cashback amount as string e.g. \\"100.00\\", or null if not mentioned>",
  "category_id": "<exact id from the list below, or null>",
  "note": "<any other useful context not captured above, max 100 chars, or null>",
  "transfer_person": "<name, phone, or UPI ID of the individual — ONLY for personal transfers. null for merchant payments>",
  "transfer_direction": "<sent | received | null — sent if user paid money out, received if user received money>"
}

Rules:
- amount: the amount spent (before cashback). Accept plain ("350"), with ₹, or with "rs"/"INR". Return as string with up to 2 decimals
- description: the merchant or item. Capitalize properly (e.g. "Zomato", "Coffee", "Auto Fare")
- payment_method: GPay/PhonePe/Paytm/UPI → upi; debit/credit card → card; cash → cash; NEFT/IMPS/bank transfer → bank_transfer. Default to upi if unclear
- date: if mentioned (including relative terms like "today", "yesterday"), resolve using today's date above. If not mentioned at all, default to ${today}
- time: if mentioned, resolve to 24h format ("3pm" → "15:00", "noon" → "12:00"). If not mentioned, default to ${currentTime}
- cashback: extract any cashback or reward amount. Return as string or null
- category_id: pick the best matching category
- transfer_person: extract ONLY when the text clearly names an individual receiving or sending money. null for businesses, merchants, or when unclear
- transfer_direction: sent = paid/sent money out; received = got money in. Always set when transfer_person is set.

${merchantHintBlock}

${categoryBlock}`;
    }

    private isOverloadedError(err: unknown): boolean {
        if (err instanceof Error) {
            const msg = err.message.toLowerCase();
            return msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('resource_exhausted');
        }
        return false;
    }

    private async runModel(parts: (string | Part)[]): Promise<string> {
        const genAI = this.getGenAI();
        const t0 = Date.now();
        let lastError: unknown;

        for (const modelName of this.modelFallbacks) {
            const model = genAI.getGenerativeModel({ model: modelName });

            let timeoutId!: NodeJS.Timeout;
            const timeoutP = new Promise<never>((_, reject) =>
                timeoutId = setTimeout(() => reject(new ApiError('AI parsing timed out', 504)), this.timeoutMs)
            );

            try {
                const result = await Promise.race([model.generateContent(parts), timeoutP]);
                clearTimeout(timeoutId);
                return result.response.text().trim();
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                const isLast = modelName === this.modelFallbacks[this.modelFallbacks.length - 1];
                if (!isLast) {
                    console.warn(JSON.stringify({
                        level: 'warn', ts: new Date().toISOString(), msg: 'gemini: model unavailable, trying next',
                        failed: modelName, reason: this.isOverloadedError(err) ? 'overloaded' : 'error',
                    }));
                    continue;
                }
                console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg: 'gemini: all models failed', ms: Date.now() - t0 }));
            }
        }
        throw lastError ?? new ApiError('AI parsing failed', 503);
    }

    private extractJson(text: string): Record<string, unknown> {
        let jsonStr = text.trim();
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        try {
            return JSON.parse(jsonStr);
        } catch {
            throw new ApiError('AI returned an unreadable response', 422);
        }
    }

    private parseAiResponse(raw: Record<string, unknown>, categories: CategoryOption[]): Record<string, unknown> {
        const validCategoryIds = new Set(categories.map(c => c.id));
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
        const cashback = typeof raw.cashback === 'string' && /^\d+(\.\d{1,2})?$/.test((raw.cashback as string).trim())
            ? (raw.cashback as string).trim() : null;
        const category_name = category_id ? categories.find(c => c.id === category_id)?.name : null;
        const transfer_person = typeof raw.transfer_person === 'string' && raw.transfer_person.trim()
            ? raw.transfer_person.trim() : null;
        const transfer_direction = (raw.transfer_direction === 'sent' || raw.transfer_direction === 'received')
            ? raw.transfer_direction as 'sent' | 'received' : null;
        return { amount, description, payment_method, date, time, cashback, category_id, category_name, note, transfer_person, transfer_direction };
    }

    async parseReceipt(imageBase64: string, mimeType: string, categories: CategoryOption[], debug = false) {
        const prompt = this.buildImagePrompt(categories);
        const rawText = await this.runModel([prompt, { inlineData: { data: imageBase64, mimeType } }]);
        const raw = this.extractJson(rawText);
        const payload: Record<string, unknown> = this.parseAiResponse(raw, categories);
        if (debug) payload._debug = { prompt, rawText };
        return payload;
    }

    async parseText(text: string, categories: CategoryOption[], debug = false) {
        const { dateString, timeString } = getISTParts();
        const prompt = this.buildTextPrompt(text, categories, dateString, timeString);
        const rawText = await this.runModel([prompt]);
        const raw = this.extractJson(rawText);
        const payload: Record<string, unknown> = this.parseAiResponse(raw, categories);
        if (debug) payload._debug = { prompt, rawText };
        return payload;
    }

}
