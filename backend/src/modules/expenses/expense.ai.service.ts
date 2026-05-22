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
  "note": "<detailed breakdown of items and prices if available (e.g. 'Burger: 150, Coke: 50'), max 500 chars, or null>",
  "cashback": "<cashback amount as string e.g. \"10.00\", or null if not visible>",
  "transfer_person": "<display name of the person only — ONLY for personal transfers. null for business payments>",
  "transfer_phone": "<10-digit mobile number of the other party if visible, digits only e.g. \\"9876543210\\", or null>",
  "transfer_direction": "<sent | received | null — sent if user paid out, received if user got money>",
  "suggested_flow": "<expense | transfer> — 'transfer' if person is named and it's a personal debt/loan/gift; 'expense' for merchants/stores/shops"
}

Rules:
- amount: debit/paid amount only, not balance
- description: Use the merchant name if visible (e.g., 'Swiggy', 'Zomato', 'Amazon', 'Reliance Smart'). Otherwise, summarize the item. Be concise. CRITICAL: Never include cashback or reward details here.
- payment_method: GPay/PhonePe/Paytm/UPI → upi, debit/credit card → card
- date/time: only from what is clearly visible
- category_id: Smartly categorize the transaction. CRITICAL: If you see a highly specific category matching the item exactly (like 'Drinks' for a sarbhath/drink purchase) DO NOT put it in a generic bucket (like 'Food & Dining'). ONLY fallback to generic variants (like 'Grocery' instead of 'Chanthavila Grocery') if there's no distinguishing clue whatsoever (like an address or store name).
- note: For receipts/images, provide a detailed line-by-line breakdown of items and their individual prices in the form 'Item: Price, ...'. If it's a single item or no breakdown is visible, provide any other useful context that helps the user remember the purchase. CRITICAL: Never mention cashback or reward amounts in this field.
- cashback: Extract any clearly visible cashback or reward amount. Return as string or null.
- transfer_person: Extract ONLY when the receipt clearly shows a personal transfer between individuals. CRITICAL: Identify the OTHER party. Ignore your own name. Return ONLY the display name (e.g. "Rahul Kumar"). If only a UPI ID is visible (e.g. "rahul@okaxis"), return just the prefix before @ capitalized (e.g. "Rahul"). Never include @domain, never return name + UPI together.
- transfer_phone: Extract ONLY for personal transfers. Look for a 10-digit number in the UPI ID (e.g. "9876543210@okaxis" → "9876543210") or displayed alongside the name. Return digits only, no spaces or dashes. null if not visible or if it's a business payment.
- transfer_direction: sent = user paid/sent money out to someone; received = user got money in from someone. Look for keywords like "Paid to", "Sent to" (sent) or "Received from", "Credit from" (received).
- suggested_flow: 'transfer' if the transaction is a direct money movement to/from an individual person. 'expense' if it's clearly a payment for an item, bill, or service (e.g. food, rent, recharge), even if paid to a personal account. If the receipt has a merchant logo or business name, it's ALWAYS an 'expense'.

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
  "note": "<detailed breakdown of items and prices (e.g. 'Burger: 150, Coke: 50'), max 500 chars, or null>",
  "transfer_person": "<display name of the individual only — ONLY for personal transfers. null for merchant payments>",
  "transfer_phone": "<10-digit mobile number of the other party if mentioned, digits only e.g. \\"9876543210\\", or null>",
  "transfer_direction": "<sent | received | null — sent if user paid money out, received if user received money>",
  "suggested_flow": "<expense | transfer> — 'transfer' for person-to-person; 'expense' for shops/bills/items"
}

Rules:
- amount: the amount spent (before cashback). Accept plain ("350"), with ₹, or with "rs"/"INR". Return as string with up to 2 decimals
- description: the merchant or item. Capitalize properly (e.g. "Zomato", "Coffee", "Auto Fare"). CRITICAL: Never include cashback or reward details here.
- payment_method: GPay/PhonePe/Paytm/UPI → upi; debit/credit card → card; cash → cash; NEFT/IMPS/bank transfer → bank_transfer. Default to upi if unclear
- date: if mentioned (including relative terms like "today", "yesterday"), resolve using today's date above. If not mentioned at all, default to ${today}
- time: if mentioned, resolve to 24h format ("3pm" → "15:00", "noon" → "12:00"). If not mentioned, default to ${currentTime}
- cashback: extract any cashback or reward amount. Return as string or null.
- note: detailed breakdown of items and prices. CRITICAL: Never mention cashback or reward amounts in this field. All cashback information must only be placed in the dedicated 'cashback' field.
- category_id: pick the best matching category
- transfer_person: extract ONLY when the text names an individual receiving or sending money. CRITICAL: Identify the OTHER person involved. Return ONLY the display name (e.g. "Rahul"). If the input contains a UPI ID (e.g. "rahul@okaxis"), use just the prefix before @ capitalized. Never include @domain, never combine name and UPI. Never return the user themselves.
- transfer_phone: Extract ONLY for personal transfers. Look for a 10-digit number mentioned directly or inside a UPI ID (e.g. "9876543210@okaxis" → "9876543210"). Return digits only. null if not present.
- transfer_direction: sent = user paid/sent money out; received = user got money in.
- suggested_flow: 'transfer' for person-to-person money movements (e.g. "Sent 500 to Rahul", "Rahul gave me 200"). 'expense' if it's for a specific item, service, or bill (e.g. "Paid Rahul for auto fare", "Rent to Priya", "Bought milk"). If an item or service is explicitly mentioned, stay in 'expense'.

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
        const transfer_phone = typeof raw.transfer_phone === 'string' && /^\d{10}$/.test(raw.transfer_phone.trim())
            ? raw.transfer_phone.trim() : null;
        const transfer_direction = (raw.transfer_direction === 'sent' || raw.transfer_direction === 'received')
            ? raw.transfer_direction as 'sent' | 'received' : null;
        const suggested_flow = raw.suggested_flow === 'transfer' ? 'transfer' : 'expense';
        return { amount, description, payment_method, date, time, cashback, category_id, category_name, note, transfer_person, transfer_phone, transfer_direction, suggested_flow };
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
