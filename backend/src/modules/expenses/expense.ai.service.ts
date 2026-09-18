import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { ApiError } from '../../common/middlewares/error.middleware';
import { getISTParts, getRelativeDateHints } from '../../common/utils/date.utils';

export interface CategoryOption { id: string; name: string; icon: string; }

export interface CurrentExpenseFields {
    amount: string | null;
    description: string | null;
    date: string | null;
    time: string | null;
    category_id: string | null;
    note: string | null;
    cashback: string | null;
}

export interface MonthAnalysisInput {
    year: number;
    month: number;
    total: number;
    cashbackTotal: number;
    count: number;
    breakdown: { name: string; net: number; count: number }[];
    previousMonthNet: number | null;
    previousBreakdown: { name: string; net: number }[];
    recentTotals: { label: string; net: number }[];
    topTransactions: { description: string; amount: number; category: string }[];
    timingPattern: { label: string; share: number } | null;
    topCategoryConcentration: { categories: string[]; share: number } | null;
    baseline: { avg: number; monthsCounted: number; rank: number; totalMonths: number } | null;
    categoryAnomaly: { name: string; thisMonth: number; historicalAvg: number; monthsCounted: number } | null;
    spikeDays: { date: string; dayLabel: string; net: number; topDescriptions: string[]; spikeMultiple: number }[];
    transactionSizeShift: { thisAvg: number; prevAvg: number; thisCount: number; prevCount: number } | null;
    unusualExpenses: { dayLabel: string; description: string; amount: number; categoryName: string }[];
}

export class ExpenseAiService {
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

    private readonly itemCategoryHints = [
        { items: 'Hot malt/health drinks (Horlicks, Boost, Bournvita, Complan) and Coffee — but NOT cold/iced versions or shakes/milkshakes (e.g. "Boost Shake", "cold coffee" stay a drink, not this)', category: 'Tea' },
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

        const itemHintBlock = `Item → preferred category hints (use these if a matching category exists in the list below; otherwise choose the best fit yourself):\n${this.itemCategoryHints.map(h => `- ${h.items} → prefer category: "${h.category}"`).join('\n')}`;

        return { categoryBlock, merchantHintBlock, itemHintBlock };
    }

    private buildImagePrompt(categories: CategoryOption[]): string {
        const { categoryBlock, merchantHintBlock, itemHintBlock } = this.buildCommonBlocks(categories);

        return `You are an expense parsing assistant. Analyze this payment screenshot and extract expense details.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": "<number as string, e.g. \\"1299.00\\">",
  "description": "<what was bought; append 'from <Merchant>' ONLY for a notable merchant e.g. 'Bottle from Amazon', max 40 chars>",
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
- description: so the user knows AT A GLANCE without opening the note, prefer naming what was actually bought: if only ONE item, name that item (e.g. 'Umbrella', 'Milk'); ALWAYS keep any specific identifying detail — a proper name, title, brand, model, or event (e.g. a movie name 'Blast') — do NOT strip it into a generic label (write 'Blast Movie Ticket', NOT just 'Movie Ticket'); if MULTIPLE items, list the MAJOR items FIRST (most significant/expensive) and append '+N' for the remaining minor ones. CRITICAL: N must EXACTLY equal (total distinct items) minus (items shown) — count carefully and RECOUNT before answering (e.g. 6 items with 4 shown → '+2', not '+3'). If every item fits, do NOT append '+N'. WHERE BOUGHT: if the shop / store / place is identifiable — a local shop (e.g. 'Ayaans') or an online merchant (e.g. 'Amazon') — append 'from <Place>' after the item(s) so the user knows where (e.g. 'Milk and Butter from Ayaans', 'Bottle from Amazon'). EXCEPTION: do NOT append it when the place name equals (or is clearly equivalent to) the selected category name — it would just repeat the category; still append when they differ (place 'Ayaans', category 'Chanthavila Grocery' → keep 'from Ayaans'). CRITICAL: a shop / store / place / category name is NOT an item — never turn it into a priced item and never let it replace the real items; use the place name ALONE only when no items can be identified. When item names are known, never collapse them into a generic word like 'Groceries'. CRITICAL: NEVER put quantities or prices in the description — those belong only in the note (e.g. '2 Idli' → 'Idli'); use just the item name(s). Be concise, max 40 chars. CRITICAL: Never include cashback or reward details here.
- date/time: only from what is clearly visible
- category_id: Smartly categorize the transaction. CRITICAL: If you see a highly specific category matching the item exactly (like 'Drinks' for a sarbhath/drink purchase) DO NOT put it in a generic bucket (like 'Food & Dining'). ONLY fallback to generic variants (like 'Grocery' instead of 'Chanthavila Grocery') if there's no distinguishing clue whatsoever (like an address or store name).
- note: For receipts/images, provide a detailed breakdown of items and their individual prices in the form 'Item ₹Price', joined with ", " but with "and" before the FINAL item so it reads as a complete list ending with a full stop "." and never a trailing comma (e.g. "Burger ₹150, Fries ₹80 and Coke ₹50."; two items → "Burger ₹150 and Coke ₹50.") — the ₹ symbol makes it clear it's a price, not a quantity. If it's a single item or no breakdown is visible, provide any other useful context that helps the user remember the purchase. CRITICAL: Never mention cashback or reward amounts in this field.
- cashback: Extract any clearly visible cashback or reward amount. Return as string or null.
- transfer_person: Extract ONLY when the receipt clearly shows a personal transfer between individuals. CRITICAL: Identify the OTHER party — never return the user's own name. For chat-style UPI screens (GPay, PhonePe chat, Paytm chat), the other person's name is the CONTACT NAME shown in the header/title bar at the very top of the screen — use that name, do NOT read names from inside the chat bubbles or message body. Return ONLY the display name (e.g. "Rahul Kumar"). If only a UPI ID is visible (e.g. "rahul@okaxis"), return just the prefix before @ capitalized (e.g. "Rahul"). Never include @domain, never return name + UPI together.
- transfer_phone: Extract ONLY for personal transfers. Look for a 10-digit number in the UPI ID (e.g. "9876543210@okaxis" → "9876543210") or displayed alongside the name. Return digits only, no spaces or dashes. null if not visible or if it's a business payment.
- transfer_direction: sent = user paid/sent money out to someone; received = user got money in from someone. Look for keywords like "Paid to", "Sent to" (sent) or "Received from", "Credit from" (received).
- suggested_flow: 'transfer' if the transaction is a direct money movement to/from an individual person. 'expense' if it's clearly a payment for an item, bill, or service (e.g. food, rent, recharge), even if paid to a personal account. If the receipt has a merchant logo or business name, it's ALWAYS an 'expense'.

${merchantHintBlock}

${itemHintBlock}

${categoryBlock}`;
    }

    private buildDateRefBlock(): string {
        const h = getRelativeDateHints();
        return `Date reference (use these EXACT dates — do NOT compute dates yourself):
- Today is ${h.todayName}, ${h.todayDate}
- yesterday = ${h.yesterday}
- day before yesterday = ${h.dayBeforeYesterday}
- ${h.lastByWeekday.join('\n- ')}`;
    }

    private buildBulkTextPrompt(text: string, categories: CategoryOption[], today: string, currentTime: string): string {
        const { categoryBlock, merchantHintBlock, itemHintBlock } = this.buildCommonBlocks(categories);

        return `You are an expense parsing assistant. A user typed multiple expenses in one go. Split them into individual expenses and return a JSON ARRAY.

Today's date is ${today} and current time is ${currentTime}.

${this.buildDateRefBlock()}

Input: "${text}"

Return ONLY a JSON array (no markdown, no explanation) where each element has:
{
  "amount": "<number as string e.g. \\"350.00\\", or null if not mentioned>",
  "description": "<what was bought; append 'from <Merchant>' ONLY for a notable merchant e.g. 'Bottle from Amazon', max 40 chars>",
  "date": "<yyyy-MM-dd or null>",
  "time": "<HH:mm 24h or null>",
  "cashback": "<cashback amount as string e.g. \\"100.00\\", or null if not mentioned>",
  "category_id": "<exact id from the list below, or null>",
  "note": "<detailed breakdown of items and prices, max 500 chars, or null>",
  "transfer_person": "<display name of the individual only — ONLY for personal transfers. null for merchant payments>",
  "transfer_phone": "<10-digit mobile number if mentioned, digits only, or null>",
  "transfer_direction": "<sent | received | null>",
  "suggested_flow": "<expense | transfer>"
}

Rules for splitting — read carefully:
CRITICAL: Each NEW LINE or SEMICOLON MUST be treated as a SEPARATE transaction.
IGNORE leading numbers (like "1. ", "2. ", "10. ") at the start of a line — they are formatting cues from the UI, not part of the amount or description.

Rule of thumb: One line = One transaction.
  - "500rs for tea, snacks and juice" on ONE line → ONE expense (amount=500, note="Tea, Snacks, Juice")
  - "tea 20\nsnacks 30\njuice 15" on THREE lines → THREE distinct expenses.

Within a single line:
  - If a single amount covers multiple items (e.g., "400 for lunch and tea"), keep it as ONE transaction.
  - ONLY split a single line into two if it contains two totally unrelated transactions with separate amounts (e.g. "Lunch 200, Auto 50"), but encourage the user to use new lines for this.

Examples:
  "1. 500 for tea, snacks, juice" → ONE (ignore "1.")
  "2. lunch 150\n3. tea 20" → TWO (each line is its own)
  "4. Zomato 350; auto 60" → TWO (semicolon separator)

Field rules (per expense):
  - amount: the amount spent (before cashback). CRITICAL: The user always states the final total directly — never do arithmetic on it: do NOT multiply, and do NOT add/sum numbers together. If per-item prices AND an overall total both appear, use the OVERALL TOTAL as the amount and keep the per-item prices only in the note — never add the item prices up. Accept plain ("350"), with ₹, or with "rs"/"INR".
  - description: a concise label the user can read AT A GLANCE without opening the note. RULE: If only ONE item was bought, name that item (e.g. "Umbrella", "Phone Recharge", "Milk"). ALWAYS keep any specific identifying detail the user gave — a proper name, title, brand, model, or event (e.g. a movie name "Blast", a service like "haircut") — do NOT strip it into a generic label: write "Blast Movie Ticket", NOT just "Movie Ticket". If MULTIPLE items were bought, list the MAJOR items FIRST — the most significant ones (highest price, or the main part of the purchase) — ordered by importance, NOT input order; if they don't all fit, append "+N" for the remaining minor items (e.g. "Snacks, Onion +1"). CRITICAL: N must EXACTLY equal (total number of distinct items) minus (number of items shown in the description). Count both carefully and RECOUNT before answering — e.g. 6 items total with 4 shown → "+2" (NOT "+3"). If every item fits, do NOT append "+N" at all. WHERE BOUGHT: if the user names the shop / store / place they bought from — whether a local shop (e.g. "Ayaans") or an online merchant (e.g. "Amazon") — append "from <Place>" after the item(s) so the user knows where, e.g. "Milk and Butter from Ayaans", "Bottle from Amazon". EXCEPTION: do NOT append "from <Place>" when the place name is the same as (or clearly equivalent to) the selected category name — it would just repeat the category (e.g. place "Chanthavila Grocery" with category "Chanthavila Grocery" → show only the items). Still append it when the place name differs from the category (e.g. place "Ayaans", category "Chanthavila Grocery" → keep "from Ayaans"). CRITICAL: a shop / store / place / category name is NOT an item — it must NOT be turned into a priced item and must NOT REPLACE the real items; always keep the items and add the place only as this "from <Place>" context. Use the place name ALONE as the description only when NO items can be identified at all. For services/bills use a concise label (e.g. "Auto Fare", "Electricity Bill"). CRITICAL: When item names are known, NEVER collapse them into a generic word like "Groceries", and NEVER use fluffy phrases like "Grocery Run" — show the real major items. CRITICAL: NEVER put quantities or prices in the description — those belong only in the note (e.g. "2 Idli" → "Idli", "3 Dosa ₹60" → "Dosa"); use just the item name(s). Max 40 chars. Never include cashback details here.
  - date: if mentioned (including relative terms like "today", "yesterday", "last Monday", "day before yesterday"), resolve it using the Date reference block above — look up the exact ISO date there, do NOT compute it yourself. A bare weekday name (e.g. "monday") or "last <weekday>" both map to the "last <weekday>" reference date (the most recent past occurrence). If no date is mentioned at all, default to ${today}.
  - time: if explicitly mentioned, resolve to 24h format ("3pm" → "15:00", "noon" → "12:00"). If not mentioned but a meal is referenced, infer a typical time: breakfast → "08:30", morning tea/coffee → "09:00", lunch → "13:00", evening tea/snack → "16:30", dinner → "20:00". Only fall back to ${currentTime} if no time or meal context exists.
  - cashback: extract any cashback or reward amount.
  - note: list EVERY item mentioned in the input — do NOT skip any item. Format per item: "[qty] Item ₹Price" — include only the parts known for that item. If the user says "each" (e.g. "2 idli each 20rs"), append "each" after the price: "2 Idli ₹20 each". Join items with ", " but put "and" before the FINAL item so it reads as a complete list (e.g. "Milk ₹24, Chocolate ₹10, Onion, Kadala, Snacks and Pickle ₹5"). If there are only two items, join them with "and" (e.g. "Burger ₹150 and Coke ₹50"). End the note with a full stop "." and never a trailing comma (e.g. "Milk ₹24, Chocolate ₹10, Snacks and Pickle ₹5."). CRITICAL: include every item word AND every specific name / title / brand / model / event the user mentioned — never drop an identifying detail (e.g. "Blast movie ticket" → keep "Blast", giving "Blast movie ticket.", NOT "Movie ticket."). CRITICAL: never turn a place into a priced item (never "Ayaans ₹400"). If the user names the actual STORE / SHOP they bought from (e.g. "Ayaans", "Amazon"), append "from <Store>" at the END of the note so the user knows where (e.g. "Milk and Butter from Ayaans."). But a CATEGORY name is NOT a store: if the named place matches one of the available categories (e.g. "Chanthavila Grocery"), it is a category, NOT a store — NEVER put a category name in the note; only append an actual store/shop the user named. Do NOT multiply or recalculate prices. Never mention cashback amounts here.
  - category_id: pick the best matching category id.
  - transfer_person: extract ONLY when the text names an individual. Return ONLY the display name (e.g. "Rahul"). If the input contains a UPI ID (e.g. "rahul@okaxis"), use just the prefix capitalized. Never include @domain. Never returns the user themselves.
  - transfer_phone: Look for a 10-digit number. Digits only.
  - transfer_direction: sent = user paid/sent money out. received = user got/received money. CRITICAL: "got", "received", "collected", "took" always mean received (e.g. "got 500 to shee" → received).
  - suggested_flow: 'transfer' for person-to-person (e.g. "Sent 500 to Rahul"). 'expense' if it's for a specific item, service, or bill.

${merchantHintBlock}

${itemHintBlock}

${categoryBlock}`;
    }

    private buildTextPrompt(text: string, categories: CategoryOption[], today: string, currentTime: string): string {
        const { categoryBlock, merchantHintBlock, itemHintBlock } = this.buildCommonBlocks(categories);

        return `You are an expense parsing assistant. A user typed a natural language description of something they spent money on. Extract the expense details.

Today's date is ${today} and current time is ${currentTime}.

${this.buildDateRefBlock()}

Input: "${text}"

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": "<number as string e.g. \\"350.00\\", or null if not mentioned>",
  "description": "<what was bought; append 'from <Merchant>' ONLY for a notable merchant e.g. 'Bottle from Amazon', max 40 chars>",
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
- amount: the amount spent (before cashback). CRITICAL: The user always states the final total directly — never do arithmetic on it: do NOT multiply by a quantity (e.g. "egg 20rs for 2" → amount is "20.00", NOT 40), and do NOT add/sum numbers together. If per-item prices AND an overall total both appear, use the OVERALL TOTAL as the amount and keep the per-item prices only in the note. Accept plain ("350"), with ₹, or with "rs"/"INR". Return as string with up to 2 decimals
- description: a concise label the user can read AT A GLANCE without opening the note. RULE: If only ONE item was bought, name that item (e.g. "Umbrella", "Phone Recharge", "Milk"). ALWAYS keep any specific identifying detail the user gave — a proper name, title, brand, model, or event (e.g. a movie name "Blast", a service like "haircut") — do NOT strip it into a generic label: write "Blast Movie Ticket", NOT just "Movie Ticket". If MULTIPLE items were bought, list the MAJOR items FIRST — the most significant ones (highest price, or the main part of the purchase) — ordered by importance, NOT input order; if they don't all fit, append "+N" for the remaining minor items (e.g. "Snacks, Onion +1"). CRITICAL: N must EXACTLY equal (total number of distinct items) minus (number of items shown in the description). Count both carefully and RECOUNT before answering — e.g. 6 items total with 4 shown → "+2" (NOT "+3"). If every item fits, do NOT append "+N" at all. WHERE BOUGHT: if the user names the shop / store / place they bought from — whether a local shop (e.g. "Ayaans") or an online merchant (e.g. "Amazon") — append "from <Place>" after the item(s) so the user knows where, e.g. "Milk and Butter from Ayaans", "Bottle from Amazon". EXCEPTION: do NOT append "from <Place>" when the place name is the same as (or clearly equivalent to) the selected category name — it would just repeat the category (e.g. place "Chanthavila Grocery" with category "Chanthavila Grocery" → show only the items). Still append it when the place name differs from the category (e.g. place "Ayaans", category "Chanthavila Grocery" → keep "from Ayaans"). CRITICAL: a shop / store / place / category name is NOT an item — it must NOT be turned into a priced item and must NOT REPLACE the real items; always keep the items and add the place only as this "from <Place>" context. Use the place name ALONE as the description only when NO items can be identified at all. For services/bills use a concise label (e.g. "Auto Fare", "Electricity Bill"). CRITICAL: When item names are known, NEVER collapse them into a generic word like "Groceries", and NEVER use fluffy phrases like "Grocery Run" — show the real major items. CRITICAL: NEVER put quantities or prices in the description — those belong only in the note (e.g. "2 Idli" → "Idli", "3 Dosa ₹60" → "Dosa"); use just the item name(s). Max 40 chars. Never include cashback details here.
- date: if mentioned (including relative terms like "today", "yesterday", "last Monday", "day before yesterday"), resolve it using the Date reference block above — look up the exact ISO date there, do NOT compute it yourself. A bare weekday name (e.g. "monday") or "last <weekday>" both map to the "last <weekday>" reference date (the most recent past occurrence). If no date is mentioned at all, default to ${today}
- time: if explicitly mentioned, resolve to 24h format ("3pm" → "15:00", "noon" → "12:00"). If not mentioned but a meal is referenced, infer a typical time: breakfast → "08:30", morning tea/coffee → "09:00", lunch → "13:00", evening tea/snack → "16:30", dinner → "20:00". Only fall back to ${currentTime} if no time or meal context exists
- cashback: extract any cashback or reward amount. Return as string or null.
- note: list EVERY item mentioned in the input — do NOT skip any item, even if it has no price or quantity. Format per item: "[qty] Item ₹Price" — include only the parts known for that item. If the user says "each" (e.g. "2 idli each 20rs"), append "each" after the price: "2 Idli ₹20 each". Join items with ", " but put "and" before the FINAL item so it reads as a complete list; if there are only two items, join them with "and". End the note with a full stop "." and never a trailing comma. Examples: "2 idli each 20rs and 1 tea, 5 dosa" → "2 Idli ₹20 each, 1 Tea and 5 Dosa." | "burger 150 coke 50" → "Burger ₹150 and Coke ₹50." | "2 eggs 3 bread" → "2 Eggs and 3 Bread." | "idli dosa vada" → "Idli, Dosa and Vada." CRITICAL: scan the entire input from start to finish and include every item word AND every specific name / title / brand / model / event mentioned (e.g. "Blast movie ticket" → keep "Blast": "Blast movie ticket.") — never drop an identifying detail and never stop after the first item. CRITICAL: never turn a place into a priced item (never "Ayaans ₹400"). If the user names the actual STORE / SHOP they bought from (e.g. "Ayaans", "Amazon"), append "from <Store>" at the END of the note so the user knows where (e.g. "Milk and Butter from Ayaans."). But a CATEGORY name is NOT a store: if the named place matches one of the available categories (e.g. "Chanthavila Grocery"), it is a category, NOT a store — NEVER put a category name in the note; only append an actual store/shop the user named. Do NOT multiply or recalculate prices. If no specific items were mentioned at all, return null. Never mention cashback amounts here.
- category_id: pick the best matching category
- transfer_person: extract ONLY when the text names an individual receiving or sending money. CRITICAL: Identify the OTHER person involved. Return ONLY the display name (e.g. "Rahul"). If the input contains a UPI ID (e.g. "rahul@okaxis"), use just the prefix before @ capitalized. Never include @domain, never combine name and UPI. Never return the user themselves.
- transfer_phone: Extract ONLY for personal transfers. Look for a 10-digit number mentioned directly or inside a UPI ID (e.g. "9876543210@okaxis" → "9876543210"). Return digits only. null if not present.
- transfer_direction: Determine from the USER's perspective ONLY. sent = user paid/sent money out to someone. received = user got/received money from someone. CRITICAL: The verb "got", "received", "collected", "took" always means received, even if "to" or a person's name follows (e.g. "got 500 to shee" → received, "shee gave me 200" → received, "sent 300 to rahul" → sent, "gave priya 100" → sent). Do NOT let the word "to" override a receive-verb.
- suggested_flow: 'transfer' for person-to-person money movements (e.g. "Sent 500 to Rahul", "Rahul gave me 200"). 'expense' if it's for a specific item, service, or bill (e.g. "Paid Rahul for auto fare", "Rent to Priya", "Bought milk"). If an item or service is explicitly mentioned, stay in 'expense'.

${merchantHintBlock}

${itemHintBlock}

${categoryBlock}`;
    }

    private buildRevisePrompt(current: CurrentExpenseFields, instruction: string, categories: CategoryOption[], today: string, currentTime: string): string {
        const { categoryBlock } = this.buildCommonBlocks(categories);
        const categoryName = current.category_id ? categories.find(c => c.id === current.category_id)?.name : null;

        return `You are an expense correction assistant. The user already has this expense entered — they just gave a follow-up correction or addition, not a brand new expense. Update ONLY what the correction implies and leave every other field exactly as given below; this is an edit, not a rewrite from scratch.

Today's date is ${today} and current time is ${currentTime}.

${this.buildDateRefBlock()}

Current expense:
{
  "amount": "${current.amount ?? ''}",
  "description": "${current.description ?? ''}",
  "date": "${current.date ?? ''}",
  "time": "${current.time ?? ''}",
  "category": ${categoryName ? `"${categoryName}"` : 'null'},
  "note": ${current.note ? `"${current.note}"` : 'null'},
  "cashback": "${current.cashback ?? ''}"
}

User's correction: "${instruction}"

Rules for interpreting the correction:
- A bare number or amount-like phrase (e.g. "43", "43rs", "₹43") means the AMOUNT was wrong — replace it with this new value entirely. Never treat a bare number as a new item to add.
- Naming an item not already reflected in the note (e.g. "add biscuit", "also had a coffee") means append it to the note — and fold it into the description too if it's now one of the major items — but do NOT change the amount unless the user also gave a new total or explicit per-item price to add.
- Naming a category corrects category_id to match it.
- A date, time, merchant, or cashback correction follows the same interpretation as normal expense parsing.
- CRITICAL: never drop or forget anything from the current expense that the correction doesn't address — copy it through unchanged.
- CRITICAL — description punctuation (these rules apply ONLY to description, do NOT copy the note rules below onto it): a short at-a-glance label (max 40 chars) naming the major item(s), never quantities/prices. When updating it to add a new item, RE-JOIN THE WHOLE LABEL with ", " between items — comma immediately after the preceding word with NO space before it, then exactly one space, then the next word. NEVER a period, NEVER a space before the comma, and NEVER run two items together with no separator at all. Description never ends with a period, no matter how many items.
  - Existing description "Dosa" + correction "add kattanchaya" → "Dosa, Kattanchaya" — NOT "Dosa.Kattanchaya", NOT "DosaKattanchaya", and NOT "Dosa , Kattanchaya" (no space before the comma).
  - Existing description "Food" + correction "add drink" → "Food, Drink".
- CRITICAL — note punctuation (a DIFFERENT rule from description above — note is a full sentence, description is a comma list): the note is a LIST, and when you add an item to it you must RE-JOIN THE WHOLE LIST correctly, not just tack the new item on. Every item is separated by ", " EXCEPT the last one, which is joined with " and " (never a comma before the final item), and the whole thing ends with a single full stop. Never leave a bare comma where "and" belongs, never run two items together with no separator at all, and never end without a period.
  - Existing note "Food ₹100." + correction "add drink" → "Food ₹100 and Drink." — NOT "Food,drink" and NOT "Food ₹100, drink".
  - Existing note "Tea ₹20." + correction "add biscuit" → "Tea ₹20 and Biscuit."
  - Existing note "Tea ₹20, Coffee ₹15." + correction "add biscuit" → "Tea ₹20, Coffee ₹15 and Biscuit." (now three items: first two comma-separated, "and" only before the last).
  - If the correction gives a price for the new item, format it the same way the existing items show theirs (e.g. "₹10"); if no price was given, just the item name with no price.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": "<number as string, e.g. \\"43.00\\">",
  "description": "<short label, max 40 chars>",
  "date": "<yyyy-MM-dd>",
  "time": "<HH:mm 24h, or null>",
  "category_id": "<exact id from the list below, or null>",
  "note": "<detailed breakdown, or null>",
  "cashback": "<number as string, or null>"
}

${categoryBlock}`;
    }

    private buildMonthAnalysisPrompt(input: MonthAnalysisInput): string {
        const { year, month, total, cashbackTotal, count, breakdown, previousMonthNet, previousBreakdown, recentTotals, topTransactions, timingPattern, topCategoryConcentration, baseline, categoryAnomaly, spikeDays, transactionSizeShift, unusualExpenses } = input;
        const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });

        const CATEGORY_CAP = 12;
        const shownBreakdown = breakdown.slice(0, CATEGORY_CAP);
        const overflowBreakdown = breakdown.slice(CATEGORY_CAP);
        const breakdownLines = shownBreakdown
            .map(b => `- ${b.name}: ₹${b.net} (${b.count} transaction${b.count === 1 ? '' : 's'})`)
            .join('\n')
            + (overflowBreakdown.length > 0
                ? `\n- (+${overflowBreakdown.length} more categor${overflowBreakdown.length === 1 ? 'y' : 'ies'} totaling ₹${Math.round(overflowBreakdown.reduce((s, b) => s + b.net, 0) * 100) / 100})`
                : '');

        const momLine = previousMonthNet !== null
            ? `Previous month's total net spend: ₹${previousMonthNet}.`
            : 'No previous month data available — this is the first tracked month, so skip any month-to-month comparison.';

        const prevBreakdownBlock = previousBreakdown.length > 0
            ? `Previous month's category breakdown, for comparing category-by-category (not just the overall total):\n${previousBreakdown.map(b => `- ${b.name}: ₹${b.net}`).join('\n')}`
            : 'No previous month category breakdown available.';

        const trendBlock = recentTotals.length >= 2
            ? `Total net spend trend over recent months, oldest first (use this to say whether this is part of a real multi-month streak, not just a one-off change vs last month):\n${recentTotals.map(r => `- ${r.label}: ₹${r.net}`).join('\n')}\n- ${monthName} ${year} (this month): ₹${total}`
            : 'Not enough month-to-month history yet for a multi-month trend — skip trend-over-time commentary.';

        const topTransactionsBlock = topTransactions.length > 0
            ? `Largest transaction${topTransactions.length === 1 ? '' : 's'} this month, biggest first:\n${topTransactions.map(t => `- "${t.description}" — ₹${t.amount} (${t.category})`).join('\n')}`
            : '';

        const timingLine = timingPattern
            ? `Timing pattern: ${timingPattern.share}% of this month's net spend happened during ${timingPattern.label} specifically.`
            : 'No single day-of-week or time-of-day stood out this month — spend was fairly spread out.';

        const concentrationLine = topCategoryConcentration
            ? `Category concentration: ${topCategoryConcentration.categories.join(' and ')} together made up ${topCategoryConcentration.share}% of this month's total net spend.`
            : '';

        const baselineLine = baseline
            ? `Baseline: over the last ${baseline.monthsCounted} tracked month${baseline.monthsCounted === 1 ? '' : 's'} (not counting this one), average net spend was ₹${baseline.avg}. This month ranks #${baseline.rank} of ${baseline.totalMonths} (rank 1 = highest).`
            : 'Not enough tracked months yet to rank this month against a personal average — skip any "highest/lowest month" framing.';

        const categoryAnomalyLine = categoryAnomaly
            ? `Category anomaly: ${categoryAnomaly.name} is ₹${categoryAnomaly.thisMonth} this month vs its own ₹${categoryAnomaly.historicalAvg} average over the last ${categoryAnomaly.monthsCounted} tracked months — a real deviation from ITS OWN normal, not just vs last month.`
            : 'No category stands out as unusual against its own historical average.';

        const joinWithAnd = (items: string[]) => items.length <= 1
            ? items.join('')
            : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

        const spikeDaysLine = spikeDays.length > 0
            ? `Unusual high-spend day${spikeDays.length === 1 ? '' : 's'} (well above this month's average spending day), biggest first:\n${spikeDays.map(d => `- ${d.dayLabel}: ₹${d.net} net (${d.spikeMultiple}x an average day), driven mainly by ${joinWithAnd(d.topDescriptions)}`).join('\n')}`
            : 'No day this month stood out as a real outlier vs. the average spending day — spend was fairly even day to day.';

        const transactionSizeShiftLine = transactionSizeShift
            ? `Purchase pattern: this month averaged ₹${transactionSizeShift.thisAvg} per transaction across ${transactionSizeShift.thisCount} transactions, vs ₹${transactionSizeShift.prevAvg} per transaction across ${transactionSizeShift.prevCount} last month.`
            : '';

        const unusualExpensesLine = unusualExpenses.length > 0
            ? `Unusual one-off expense${unusualExpenses.length === 1 ? '' : 's'} this month — each is either a category the user almost never spends in, or far bigger than that category's normal one-off (e.g. a hospital bill, a big repair). The exact date/amount is ALREADY shown to the user separately as its own list — do NOT repeat those figures, just acknowledge them exist:\n${unusualExpenses.map(u => `- ${u.dayLabel}: "${u.description}" — ₹${u.amount} (${u.categoryName})`).join('\n')}`
            : '';

        return `You are a sharp personal finance analyst, not a report generator. Using ONLY the numbers given below — never invent, estimate, or assume anything not explicitly listed here — write a spending analysis for ${monthName} ${year} that draws real conclusions, not just a readout of stats.

Total net spend: ₹${total} across ${count} transaction${count === 1 ? '' : 's'}.
Cashback earned: ₹${cashbackTotal}.
${momLine}
${baselineLine}
${categoryAnomalyLine}
${spikeDaysLine}
${unusualExpensesLine}
${transactionSizeShiftLine}
${timingLine}
${concentrationLine}

${topTransactionsBlock}

This month's category breakdown (net spend, highest first):
${breakdownLines}

${prevBreakdownBlock}

${trendBlock}

Return ONLY a JSON array of exactly 5 short strings (no markdown, no explanation outside the array) — each string is ONE standalone point, meant to be read as a separate line, not a paragraph. Every point must draw a conclusion or characterize behavior — not just restate a number that's already sitting in the data above:

1. HEADLINE VERDICT: if the baseline/rank fact is given above, lead with what kind of month this was relative to the user's own recent normal — e.g. "This was your highest spending month in the last 5 you've tracked, 34% above your ₹5,200 average." If no baseline is available yet, characterize the month plainly using the total and transaction count instead, without inventing a comparison.
2. CATEGORY ANOMALY: if the category-anomaly fact is given above, explain it in plain terms — is this a new/growing habit or a return to something dormant, and how far off the category's own normal is it (e.g. "Groceries hit ₹2,400 this month, over double its usual ₹900 — your biggest deviation from normal all year."). If no anomaly is available, instead compare THIS month's category breakdown against the PREVIOUS month's category-by-category and call out the single category that moved the most, by name, with its ₹ or % shift; say explicitly if a category appeared or vanished entirely.
3. UNUSUAL HIGH-SPEND DAYS, ONE-OFF EXPENSES, OR TOP TRANSACTIONS: if the unusual-high-spend-days fact above lists one or more days, the exact date, amount, and what drove each one is ALREADY shown to the user separately as its own scannable list right below your analysis — do NOT repeat those individual amounts/dates/items here, that would just be redundant. Instead use this point to add the one thing a bare list can't: characterize them collectively in a single short sentence — e.g. are they scattered one-off outings, clustered together in the same week, all the same kind of spending, or a genuine break from routine (e.g. "You had 3 spend spikes this month, all in the back half — worth a look if that's becoming a pattern rather than one-off outings."). If only one day is listed, one short sentence characterizing that single day is enough (e.g. "That one spike aside, spending stayed close to your usual day-to-day range all month."). If the unusual-one-off-expenses fact above lists anything (a rare-category or way-bigger-than-normal purchase, e.g. a hospital bill or a big repair), fold a brief acknowledgment of it into this same point too — again without repeating its exact date/amount since that's shown separately — e.g. note that it looks like a genuine one-off rather than a new pattern, or flag if it's the kind of thing worth budgeting for going forward. If none of spike-days or one-off-expenses are listed, mention the largest transaction(s) given above instead, by description and amount, framed as a specific standout moment — if two or three are close in size, say so.
4. BEHAVIOR SHIFT: if the purchase-pattern fact is given above, characterize whether the user is making fewer-but-bigger purchases or more-frequent-but-smaller ones compared to last month, and what that suggests (e.g. "You made 40% fewer purchases than last month but each one averaged 60% more — fewer, bigger trips rather than daily small spends."). If not available, use the multi-month trend instead to say whether this month continues a real streak or is a one-off deviation — do not just restate a single month-over-month %.
5. SOMETHING ELSE SPECIFIC: use the timing pattern or category-concentration fact above, whichever is more notable and not already covered by points 1-4 — e.g. a timing habit, or how concentrated spend is in just 1-2 categories. Treat high concentration (over ~55%) as worth flagging, or note positively if spend looks well-spread. If neither applies, make one other genuinely specific observation from the data (e.g. cashback earned being ₹0 despite meaningful spend) — never repeat a point already made above.

Write like a friend who actually studied your numbers and is telling you what they mean, not listing them back to you. Never a vague sentence like "spending was up this month" — always say what it means, whether it's unusual for the user personally, and why. Use ₹ for all amounts. Never wrap a category name in quotes — write Groceries, not "Groceries". Do not mention anything not present in the data above. Example shape: ["This was your highest spending month in the last 5 you've tracked, 34% above your usual ₹5,200.", "Groceries hit ₹2,400 this month, over double its normal ₹900 — the biggest outlier in your spending all year.", "You had 2 spend spikes this month, both look like one-off outings rather than a routine pattern.", "You made 40% fewer purchases than last month but each one averaged 60% more — fewer, bigger trips rather than daily small spends.", "Food & Dining and Transport together made up 63% of everything you spent this month."]`;
    }

    async analyzeMonth(input: MonthAnalysisInput): Promise<string[]> {
        const prompt = this.buildMonthAnalysisPrompt(input);
        const rawText = await this.runModel([prompt]);

        let jsonStr = rawText.trim();
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
            jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
        }
        try {
            const points = JSON.parse(jsonStr);
            if (Array.isArray(points) && points.every(p => typeof p === 'string')) return points;
        } catch {
            // fall through
        }
        throw new ApiError('AI returned an unreadable response', 422);
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
                console.error(JSON.stringify({
                    level: 'error', ts: new Date().toISOString(), msg: 'gemini: all models failed', ms: Date.now() - t0,
                    error: err instanceof Error ? err.message : String(err),
                }));
            }
        }
        // A raw SDK/network error can carry a huge message (full response
        // bodies, stack traces) — that's fine in the server log above, but
        // the client only ever needs a short, clean reason. ApiErrors we
        // threw ourselves (e.g. the per-model timeout) are already clean.
        if (lastError instanceof ApiError) throw lastError;
        throw new ApiError('AI request failed — please try again', 503);
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
        return { amount, description, date, time, cashback, category_id, category_name, note, transfer_person, transfer_phone, transfer_direction, suggested_flow };
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

    async reviseExpense(current: CurrentExpenseFields, instruction: string, categories: CategoryOption[], debug = false) {
        const { dateString, timeString } = getISTParts();
        const prompt = this.buildRevisePrompt(current, instruction, categories, dateString, timeString);
        const rawText = await this.runModel([prompt]);
        const raw = this.extractJson(rawText);
        const payload: Record<string, unknown> = this.parseAiResponse(raw, categories);
        if (debug) payload._debug = { prompt, rawText };
        return payload;
    }

    async parseBulkText(text: string, categories: CategoryOption[], debug = false) {
        const { dateString, timeString } = getISTParts();
        const prompt = this.buildBulkTextPrompt(text, categories, dateString, timeString);
        const rawText = await this.runModel([prompt]);

        // Extract JSON array from the model output
        let jsonStr = rawText.trim();
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
            jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
        }
        let rawArray: Record<string, unknown>[];
        try {
            rawArray = JSON.parse(jsonStr);
            if (!Array.isArray(rawArray)) rawArray = [rawArray];
        } catch {
            throw new ApiError('AI returned an unreadable response', 422);
        }
        const items = rawArray.map(raw => this.parseAiResponse(raw, categories));
        if (debug) return { items, _debug: { prompt, rawText } };
        return { items };
    }


}
