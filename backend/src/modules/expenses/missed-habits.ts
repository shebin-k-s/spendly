// "Possibly missed" suggestions, learned from the owner's own logging — nothing
// here is configured; every request re-learns from the last LOOKBACK_DAYS, so a
// new habit appears once it has repeated and an old one fades when it stops.
//
// A HABIT is a category at a time of day (entries of one category chained while
// they are within 75 minutes of each other: Food & Dining ~10:00, Tea ~16:30…).
// For each weekday it is learned separately: it applies on a weekday only if it
// happened on at least MIN_RATE of that weekday's days. On such a day:
//  - if one specific ITEM (dosa, kattanchaya, egg…) shows up on at least
//    EXACT_CHANCE of that weekday's days, the suggestion is that exact entry
//    (its usual description, amount and time) with the usual alternates;
//  - otherwise the meal varies too much to name one item, so the most likely
//    entries for that weekday are offered to pick from.
// A suggestion appears only when nothing on that day covers the habit.
//
// Pure functions, no DB access, so the same code can be backtested.

export interface HabitExpense {
    date: string; // yyyy-MM-dd
    time: string | null; // HH:mm
    amount: number;
    description: string;
    note: string | null;
    categoryId: string | null;
    categoryName: string | null;
    categoryIcon?: string | null;
}

export interface Alternate {
    description: string;
    amount: number;
}

export interface WeekdayPlan {
    kind: 'exact' | 'pick';
    description: string;
    note: string | null;
    amount: number;
    minutes: number; // usual time of the suggested entry
    chance: number; // 0..1 — exact: how often that item shows up on this weekday; pick: how often the habit does
    item: string | null; // the item word an exact plan is built on
    alternates: Alternate[];
}

export interface Habit {
    categoryId: string;
    categoryName: string;
    categoryIcon: string;
    medianMinutes: number;
    timeIsReal: boolean; // false when the usual time looks like a default (:00 / :30)
    slotKey: string; // stable id for the discard ledger
    plans: Record<number, WeekdayPlan>; // only weekdays where the habit qualifies; 0 = Sunday
}

export interface Suggestion {
    categoryId: string;
    categoryName: string;
    categoryIcon: string;
    slotKey: string;
    kind: 'exact' | 'pick';
    description: string;
    note: string | null;
    amount: number;
    minutes: number;
    time: string;
    chancePct: number;
    alternates: Alternate[];
}

export const LOOKBACK_DAYS = 70; // 10 weeks: backtested best on real data — longer dilutes habits that grew recently, shorter is too noisy
export const CLUSTER_GAP_MINUTES = 75;
export const MIN_OCCURRENCES = 4;
export const MIN_RATE = 0.6;
export const EXACT_CHANCE = 0.45;
export const MIN_ITEM_DAYS = 3;
export const COVER_WINDOW_MINUTES = 90; // same category this close to the usual time covers the habit
export const SWAP_WINDOW_MINUTES = 60; // anything this close to a REAL (non-default) usual time covers it (vada instead of dosa)
export const TODAY_GRACE_MINUTES = 60;
export const MAX_ALTERNATES = 2;
export const MAX_PICKS = 3;

const STOPWORDS = new Set([
    'and', 'from', 'the', 'for', 'with', 'item', 'items', 'each', 'some', 'extra', 'plus', 'combo', 'curry', 'rupees', 'rupee',
]);

export function dayOfWeek(date: string): number {
    return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function toMinutes(time: string): number {
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function clock(minutes: number): string {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
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

/** Item words an entry mentions in its description or note ("from <shop>" is where, not what). */
export function itemsOf(e: Pick<HabitExpense, 'description' | 'note'>): string[] {
    const withoutShop = (t: string) => t.replace(/\bfrom\b[^,.]*/gi, ' ');
    const words = `${withoutShop(e.description)} ${withoutShop(e.note ?? '')}`
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
        .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
    return [...new Set(words)];
}

type Timed = HabitExpense & { categoryId: string; time: string };

interface Variant {
    key: string; // lower-cased description
    description: string; // latest casing
    note: string | null;
    amount: number; // most common amount for this description
    days: Set<string>;
    minutes: number[];
}

function variantsOf(entries: Timed[]): Variant[] {
    const by = new Map<string, Timed[]>();
    for (const e of entries) {
        const k = e.description.trim().toLowerCase();
        by.set(k, [...(by.get(k) ?? []), e]);
    }
    return [...by.entries()]
        .map(([key, es]) => {
            const latest = es.reduce((a, b) => (b.date > a.date ? b : a));
            const notes = es.map((e) => e.note).filter((n): n is string => !!n);
            return {
                key,
                description: latest.description.trim(),
                note: notes.length ? mostCommon(notes) : null,
                amount: mostCommon(es.map((e) => e.amount)),
                days: new Set(es.map((e) => e.date)),
                minutes: es.map((e) => toMinutes(e.time)),
            };
        })
        .sort((a, b) => b.days.size - a.days.size || a.key.localeCompare(b.key));
}

/** Learn every habit as of `asOf` from the LOOKBACK_DAYS strictly before it. */
export interface LearnOptions {
    lookbackDays?: number;
    minRate?: number;
}

export function learnHabits(expenses: HabitExpense[], asOf: string, opts: LearnOptions = {}): Habit[] {
    const lookback = opts.lookbackDays ?? LOOKBACK_DAYS;
    const minRate = opts.minRate ?? MIN_RATE;
    const start = addDays(asOf, -lookback);
    const window = expenses.filter((e): e is Timed => !!e.time && !!e.categoryId && e.date >= start && e.date < asOf);
    if (window.length === 0) return [];

    // Weekdays from before tracking began must not drag a rate down.
    const firstTracked = window.reduce((min, e) => (e.date < min ? e.date : min), window[0].date);
    const dowTotal = new Array(7).fill(0);
    for (let d = firstTracked; d < asOf; d = addDays(d, 1)) dowTotal[dayOfWeek(d)]++;

    const byCategory = new Map<string, Timed[]>();
    for (const e of window) byCategory.set(e.categoryId, [...(byCategory.get(e.categoryId) ?? []), e]);

    const habits: Habit[] = [];
    for (const entries of byCategory.values()) {
        const sorted = [...entries].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
        const clusters: Timed[][] = [];
        let cur: Timed[] = [];
        for (const e of sorted) {
            if (cur.length && toMinutes(e.time) - toMinutes(cur[cur.length - 1].time) > CLUSTER_GAP_MINUTES) {
                clusters.push(cur);
                cur = [];
            }
            cur.push(e);
        }
        if (cur.length) clusters.push(cur);

        for (const cluster of clusters) {
            const medianMinutes = median(cluster.map((e) => toMinutes(e.time)));
            const daysByDow: Map<string, Timed[]>[] = Array.from({ length: 7 }, () => new Map());
            for (const e of cluster) {
                const m = daysByDow[dayOfWeek(e.date)];
                m.set(e.date, [...(m.get(e.date) ?? []), e]);
            }
            const plans: Record<number, WeekdayPlan> = {};
            for (let dow = 0; dow < 7; dow++) {
                const occurrences = daysByDow[dow].size;
                const rate = dowTotal[dow] ? occurrences / dowTotal[dow] : 0;
                if (occurrences < MIN_OCCURRENCES || rate < minRate) continue;
                plans[dow] = planFor(cluster, [...daysByDow[dow].values()].flat(), dow, dowTotal[dow], rate, medianMinutes);
            }
            if (Object.keys(plans).length === 0) continue;

            const first = cluster[0];
            habits.push({
                categoryId: first.categoryId,
                categoryName: first.categoryName ?? '',
                categoryIcon: first.categoryIcon ?? '',
                medianMinutes,
                timeIsReal: Math.round(medianMinutes) % 30 !== 0,
                slotKey: clock(Math.round(medianMinutes / 30) * 30),
                plans,
            });
        }
    }
    return habits.sort((a, b) => a.medianMinutes - b.medianMinutes);
}

function planFor(cluster: Timed[], onThisWeekday: Timed[], dow: number, weekdayCount: number, rate: number, clusterMinutes: number): WeekdayPlan {
    // Which single item shows up most reliably on this weekday?
    const itemDays = new Map<string, Set<string>>();
    for (const e of onThisWeekday) for (const item of itemsOf(e)) itemDays.set(item, (itemDays.get(item) ?? new Set()).add(e.date));
    const best = [...itemDays.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0];
    const bestChance = best ? best[1].size / weekdayCount : 0;

    if (best && best[1].size >= MIN_ITEM_DAYS && bestChance >= EXACT_CHANCE) {
        // The usual entry for that item, learned from every weekday (more samples).
        const withItem = cluster.filter((e) => itemsOf(e).includes(best[0]));
        const variants = variantsOf(withItem);
        const main = variants[0];
        const alternates = variants.slice(1, 1 + MAX_ALTERNATES).map((v) => ({ description: v.description, amount: v.amount }));
        return {
            kind: 'exact',
            description: main.description,
            note: main.note,
            amount: main.amount,
            minutes: median(main.minutes),
            chance: Math.round(bestChance * 100) / 100,
            item: best[0],
            alternates,
        };
    }

    const variants = variantsOf(onThisWeekday.length >= 3 ? onThisWeekday : cluster);
    const main = variants[0];
    return {
        kind: 'pick',
        description: main.description,
        note: main.note,
        amount: main.amount,
        minutes: clusterMinutes,
        chance: Math.round(rate * 100) / 100,
        item: null,
        alternates: variants.slice(1, MAX_PICKS).map((v) => ({ description: v.description, amount: v.amount })),
    };
}

/**
 * The suggestions for one date: habits that apply on its weekday and that nothing
 * on that day covers. For today (nowMinutes given) a habit only counts once its
 * usual time plus a grace period has passed — before that it is "not yet".
 */
export function suggestionsOn(habits: Habit[], dayExpenses: HabitExpense[], date: string, nowMinutes: number | null): Suggestion[] {
    const dow = dayOfWeek(date);
    const out: Suggestion[] = [];
    for (const h of habits) {
        const plan = h.plans[dow];
        if (!plan) continue;
        if (nowMinutes !== null && nowMinutes < plan.minutes + TODAY_GRACE_MINUTES) continue;

        const covered = dayExpenses.some((e) => {
            const m = e.time ? toMinutes(e.time) : null;
            if (e.categoryId === h.categoryId && (m === null || Math.abs(m - h.medianMinutes) <= COVER_WINDOW_MINUTES)) return true;
            if (plan.item && itemsOf(e).includes(plan.item)) return true;
            return h.timeIsReal && m !== null && Math.abs(m - h.medianMinutes) <= SWAP_WINDOW_MINUTES;
        });
        if (covered) continue;

        out.push({
            categoryId: h.categoryId,
            categoryName: h.categoryName,
            categoryIcon: h.categoryIcon,
            slotKey: h.slotKey,
            kind: plan.kind,
            description: plan.description,
            note: plan.note,
            amount: plan.amount,
            minutes: plan.minutes,
            time: clock(plan.minutes),
            chancePct: Math.round(plan.chance * 100),
            alternates: plan.alternates,
        });
    }
    return out.sort((a, b) => a.minutes - b.minutes);
}
