// "Possibly missed" detection, designed from the owner's real logging data.
//
// What the data showed (see git history for the analysis):
//  - 41% of entries are logged a day or more after the day they belong to, almost
//    all of them evening spending (groceries, petrol, snacks) — what gets
//    "missed" is a PART OF THE DAY, not a particular item. Item-level habits
//    recovered only ~8% of those late entries; time-slot habits recover ~70%.
//  - Weekday-specific rates and recency decay both made it worse, so a plain
//    56-day window over all days is used.
//  - Which category/amount will turn up in a slot is only ~60% / ~33%
//    predictable, so a flagged slot offers a few likely categories to pick from
//    instead of pretending to know the exact item and price.
//
// Pure functions, no DB access, so the same code can be backtested.

export type Slot = 'morning' | 'lunch' | 'tea' | 'evening';
export const SLOTS: Slot[] = ['morning', 'lunch', 'tea', 'evening'];

// Local clock-time bounds of each slot, in minutes since midnight.
const SLOT_END_MINUTES: Record<Slot, number> = { morning: 12 * 60, lunch: 15 * 60 + 30, tea: 18 * 60, evening: 24 * 60 };

export interface HabitExpense {
    date: string; // yyyy-MM-dd
    time: string | null; // HH:mm
    amount: number;
    description: string;
    note: string | null;
    categoryId: string | null;
    categoryName: string | null;
}

export interface Candidate {
    categoryId: string | null;
    categoryName: string | null;
    description: string;
    note: string | null;
    amount: number; // median
    amountLow: number; // 25th percentile
    amountHigh: number; // 75th percentile
    days: number; // days in the window this category showed up in the slot
    share: number; // days / window days, 0..1
}

export interface SlotHabit {
    slot: Slot;
    rate: number; // share of window days with at least one entry in this slot
    presentDays: number;
    windowDays: number;
    candidates: Candidate[]; // most likely categories first
}

export const LOOKBACK_DAYS = 56;
export const MIN_PRESENT_DAYS = 4;
export const MIN_RATE = 0.8;
export const MAX_CANDIDATES = 3;

export function dayOfWeek(date: string): number {
    return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

const isWeekend = (date: string) => [0, 6].includes(dayOfWeek(date));

export function slotOf(time: string | null): Slot | null {
    if (!time) return null;
    if (time < '08:00') return null; // night owl entries belong to no routine slot
    if (time < '12:00') return 'morning';
    if (time < '15:30') return 'lunch';
    if (time < '18:00') return 'tea';
    return 'evening';
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function mostCommon<T>(xs: T[]): T {
    const counts = new Map<T, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Learn which parts of the day normally have spending, as of `asOf`, from the
 * LOOKBACK_DAYS strictly before it. Only slots that are filled on at least
 * MIN_RATE of those days qualify as routine.
 */
export function learnSlots(expenses: HabitExpense[], asOf: string, opts: { splitWeekend?: boolean } = {}): SlotHabit[] {
    const splitWeekend = opts.splitWeekend ?? false;
    const start = addDays(asOf, -LOOKBACK_DAYS);
    // Optionally compare weekday vs weekday / weekend vs weekend. Off by default:
    // on the owner's data it measured slightly worse (77% vs 80% precision) than
    // treating all days alike, and seven separate weekdays measured worse still.
    const sameKind = (date: string) => !splitWeekend || isWeekend(date) === isWeekend(asOf);
    const window = expenses.filter((e) => e.date >= start && e.date < asOf && sameKind(e.date));
    if (window.length === 0) return [];

    // Don't count days from before tracking began.
    const firstTracked = window.reduce((min, e) => (e.date < min ? e.date : min), window[0].date);
    let windowDays = 0;
    for (let d = firstTracked; d < asOf; d = addDays(d, 1)) if (sameKind(d)) windowDays++;
    if (windowDays < MIN_PRESENT_DAYS) return [];

    const habits: SlotHabit[] = [];
    for (const slot of SLOTS) {
        const inSlot = window.filter((e) => slotOf(e.time) === slot);
        const presentDays = new Set(inSlot.map((e) => e.date)).size;
        const rate = presentDays / windowDays;
        if (presentDays < MIN_PRESENT_DAYS || rate < MIN_RATE) continue;

        const byCategory = new Map<string, HabitExpense[]>();
        for (const e of inSlot) {
            const key = e.categoryId ?? '-';
            byCategory.set(key, [...(byCategory.get(key) ?? []), e]);
        }
        const candidates: Candidate[] = [...byCategory.values()]
            .map((entries) => {
                const days = new Set(entries.map((e) => e.date)).size;
                const typical = mostCommon(entries.map((e) => e.description.trim().toLowerCase()));
                const same = entries.filter((e) => e.description.trim().toLowerCase() === typical);
                const latest = same.reduce((a, b) => (b.date > a.date ? b : a));
                const notes = same.map((e) => e.note).filter((n): n is string => !!n);
                const amounts = entries.map((e) => e.amount).sort((a, b) => a - b);
                return {
                    categoryId: latest.categoryId,
                    categoryName: latest.categoryName,
                    description: latest.description,
                    note: notes.length ? mostCommon(notes) : null,
                    amount: quantile(amounts, 0.5),
                    amountLow: quantile(amounts, 0.25),
                    amountHigh: quantile(amounts, 0.75),
                    days,
                    share: Math.round((days / windowDays) * 100) / 100,
                };
            })
            .sort((a, b) => b.days - a.days)
            .slice(0, MAX_CANDIDATES);

        habits.push({ slot, rate: Math.round(rate * 100) / 100, presentDays, windowDays, candidates });
    }
    return habits;
}

/**
 * The slots that are routine but have nothing logged on `date`. For today a slot
 * only counts once it is over (nowMinutes ≥ its end); before that it is "not yet".
 * Pass nowMinutes = null for a past day.
 */
export function gapsOn(habits: SlotHabit[], dayExpenses: HabitExpense[], nowMinutes: number | null): SlotHabit[] {
    const filled = new Set(dayExpenses.map((e) => slotOf(e.time)));
    return habits.filter((h) => !filled.has(h.slot) && (nowMinutes === null || nowMinutes >= SLOT_END_MINUTES[h.slot]));
}
