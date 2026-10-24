// Weekday-aware habit detection for "possibly missed" suggestions.
//
// A habit is an ITEM (dosa, kattanchaya, egg…) — not a category at a clock time.
// For each weekday we measure how often the item showed up over the last weeks;
// when it usually shows up on that weekday and today it didn't, that's an
// irregularity worth asking about. Pure functions, no DB access, so the same
// code can be backtested against real data.

export interface HabitExpense {
    date: string; // yyyy-MM-dd
    time: string | null; // HH:mm
    amount: number;
    description: string;
    note: string | null;
    categoryId: string | null;
    categoryName: string | null;
}

export interface Habit {
    item: string;
    weekday: number; // 0 = Sunday
    rate: number; // share of that weekday's days the item appeared, last LOOKBACK_DAYS
    occurrences: number;
    weekdayCount: number;
    expectedMinutes: number;
    expectedTime: string;
    typicalDescription: string;
    typicalAmount: number;
    typicalNote: string | null;
    categoryId: string | null;
    categoryName: string | null;
    lastSeen: string;
}

export const LOOKBACK_DAYS = 56; // 8 weeks
export const MIN_OCCURRENCES = 4;
export const MIN_RATE = 0.6;
export const RECENT_DAYS = 14; // an item not seen at all lately has stopped being a habit
export const TODAY_GRACE_MINUTES = 90;
// Anything logged close to the habit's usual time (vada under Snacks instead of
// dosa under Food & Dining) is a swap, not a missed expense — whatever its
// category, since the same meal gets filed under different ones.
export const SUBSTITUTE_WINDOW_MINUTES = 60;

const STOPWORDS = new Set([
    'and', 'from', 'the', 'for', 'with', 'item', 'items', 'rupees', 'rupee', 'rs', 'inr', 'each', 'at', 'of', 'to',
    'in', 'on', 'my', 'some', 'extra', 'plus',
]);

export function dayOfWeek(date: string): number {
    return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function toMinutes(time: string | null): number | null {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function clock(minutes: number): string {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The distinct item words an expense mentions in its description or note. */
export function itemsOf(e: Pick<HabitExpense, 'description' | 'note'>): string[] {
    // "Egg from Ayaans" — the shop is where it was bought, not an item, and as a
    // "habit" it would glue unrelated purchases from the same shop together.
    const withoutShop = (text: string) => text.replace(/\bfrom\b[^,.]*/gi, ' ');
    const words = `${withoutShop(e.description)} ${withoutShop(e.note ?? '')}`
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
        .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
    return [...new Set(words)];
}

const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function mostCommon<T>(xs: T[]): T {
    const counts = new Map<T, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Learn habits as of `asOf` from the LOOKBACK_DAYS strictly before it.
 * Pass only expenses you want considered; anything on/after `asOf` is ignored.
 */
export function learnHabits(expenses: HabitExpense[], asOf: string): Habit[] {
    const start = addDays(asOf, -LOOKBACK_DAYS);
    const window = expenses.filter((e) => e.date >= start && e.date < asOf);
    if (window.length === 0) return [];

    // Don't penalise weekdays from before tracking began.
    const firstTracked = window.reduce((min, e) => (e.date < min ? e.date : min), window[0].date);
    const weekdayCount = new Array(7).fill(0);
    for (let d = firstTracked; d < asOf; d = addDays(d, 1)) weekdayCount[dayOfWeek(d)]++;

    // item → weekday → date → entries mentioning it
    const index = new Map<string, Map<number, Map<string, HabitExpense[]>>>();
    for (const e of window) {
        const dow = dayOfWeek(e.date);
        for (const item of itemsOf(e)) {
            const byDow = index.get(item) ?? new Map();
            const byDate = byDow.get(dow) ?? new Map();
            byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
            byDow.set(dow, byDate);
            index.set(item, byDow);
        }
    }

    const recentCutoff = addDays(asOf, -RECENT_DAYS);
    const habits: Habit[] = [];
    for (const [item, byDow] of index) {
        const allDates = [...byDow.values()].flatMap((m) => [...m.keys()]);
        const lastSeen = allDates.reduce((max, d) => (d > max ? d : max), allDates[0]);
        if (lastSeen < recentCutoff) continue;

        for (const [weekday, byDate] of byDow) {
            const occurrences = byDate.size;
            const total = weekdayCount[weekday];
            const rate = total > 0 ? occurrences / total : 0;
            if (occurrences < MIN_OCCURRENCES || rate < MIN_RATE) continue;

            const entries = [...byDate.values()].flat();
            const minutes = entries.map((e) => toMinutes(e.time)).filter((m): m is number => m !== null);
            const typicalKey = mostCommon(entries.map((e) => e.description.trim().toLowerCase()));
            const sameKind = entries.filter((e) => e.description.trim().toLowerCase() === typicalKey);
            const latest = sameKind.reduce((a, b) => (b.date > a.date ? b : a));
            const notes = sameKind.map((e) => e.note).filter((n): n is string => !!n);

            habits.push({
                item,
                weekday,
                rate: Math.round(rate * 100) / 100,
                occurrences,
                weekdayCount: total,
                expectedMinutes: minutes.length ? median(minutes) : 12 * 60,
                expectedTime: clock(minutes.length ? median(minutes) : 12 * 60),
                typicalDescription: latest.description,
                typicalAmount: mostCommon(sameKind.map((e) => e.amount)),
                typicalNote: notes.length ? mostCommon(notes) : null,
                categoryId: latest.categoryId,
                categoryName: latest.categoryName,
                lastSeen,
            });
        }
    }

    // Two item words from the same entry ("Dosa and Kattanchaya") would suggest
    // the same card twice — keep the stronger habit per weekday + typical entry.
    const best = new Map<string, Habit>();
    for (const h of habits) {
        const key = `${h.weekday}|${h.typicalDescription.trim().toLowerCase()}`;
        const cur = best.get(key);
        if (!cur || h.rate > cur.rate || (h.rate === cur.rate && h.item < cur.item)) best.set(key, h);
    }
    return [...best.values()].sort((a, b) => a.weekday - b.weekday || a.expectedMinutes - b.expectedMinutes);
}

/** Habits that normally happen on this date's weekday. */
export function expectedOn(habits: Habit[], date: string): Habit[] {
    const dow = dayOfWeek(date);
    return habits.filter((h) => h.weekday === dow);
}

/**
 * The irregularities for one date: habits expected that day with no matching
 * entry (any category, any time). For today, only once the habit's usual time
 * plus a grace period has passed — before that it is simply "not yet".
 */
export function gapsOn(habits: Habit[], dayExpenses: HabitExpense[], date: string, nowMinutes: number | null): Habit[] {
    const present = new Set(dayExpenses.flatMap((e) => itemsOf(e)));
    return expectedOn(habits, date).filter((h) => {
        if (present.has(h.item)) return false;
        const swapped = dayExpenses.some((e) => {
            const m = toMinutes(e.time);
            return m !== null && Math.abs(m - h.expectedMinutes) <= SUBSTITUTE_WINDOW_MINUTES;
        });
        if (swapped) return false;
        if (nowMinutes !== null && nowMinutes < h.expectedMinutes + TODAY_GRACE_MINUTES) return false;
        return true;
    });
}
