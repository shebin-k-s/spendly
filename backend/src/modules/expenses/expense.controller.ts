import { Request, Response } from 'express';
import crypto from 'crypto';
import { ExpenseService } from './expense.service';
import { CategoryService } from '../categories/category.service';
import { ExpenseAiService, type MonthAnalysisInput } from './expense.ai.service';
import { getISTParts, getRelativeDateHints } from '../../common/utils/date.utils';

const log = {
    info: (msg: string, meta?: Record<string, unknown>) =>
        console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg, ...meta })),
    error: (msg: string, meta?: Record<string, unknown>) =>
        console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg, ...meta })),
};

const service = new ExpenseService();
const categoryService = new CategoryService();
const aiService = new ExpenseAiService();

function ordinalSuffix(n: number): string {
    if (n % 10 === 1 && n % 100 !== 11) return 'st';
    if (n % 10 === 2 && n % 100 !== 12) return 'nd';
    if (n % 10 === 3 && n % 100 !== 13) return 'rd';
    return 'th';
}

export class ExpenseController {
    getByMonth = async (req: Request, res: Response) => {
        const { year: istYear, month: istMonth } = getISTParts();
        const year = parseInt(req.query.year as string) || istYear;
        const month = parseInt(req.query.month as string) || istMonth;
        const categoryId = req.query.categoryId as string | undefined;
        res.json(await service.getByMonth(year, month, categoryId));
    };

    getMonthlySummary = async (req: Request, res: Response) => {
        const { year: istYear, month: istMonth } = getISTParts();
        const year = parseInt(req.query.year as string) || istYear;
        const month = parseInt(req.query.month as string) || istMonth;
        res.json(await service.getMonthlySummary(year, month));
    };

    getAnalytics = async (req: Request, res: Response) => {
        const months = parseInt(req.query.months as string) || 6;
        res.json(await service.getAnalytics(months));
    };

    analyzeMonth = async (req: Request, res: Response) => {
        const { year: istYear, month: istMonth } = getISTParts();
        const year = parseInt(req.query.year as string) || istYear;
        const month = parseInt(req.query.month as string) || istMonth;

        const summary = await service.getMonthlySummary(year, month);
        if (summary.count === 0) {
            res.status(400).json({ message: 'No expenses to analyze for this month' });
            return;
        }

        // Previous 6 months (not just 1) — lets the AI tell a real streak
        // ("risen 3 months running") from a one-off blip, not just a single
        // MoM delta. JS Date rolls negative months back a year automatically.
        const prevMonthDates = [1, 2, 3, 4, 5, 6].map(i => new Date(year, month - 1 - i, 1));
        const [prevSummaries, monthExpenses] = await Promise.all([
            Promise.all(prevMonthDates.map(d => service.getMonthlySummary(d.getFullYear(), d.getMonth() + 1))),
            service.getByMonth(year, month),
        ]);
        const [prevSummary] = prevSummaries;
        const thisMonthNet = Math.round((summary.total - summary.cashbackTotal) * 100) / 100;

        // Only months the app actually has data for — an early month with
        // count 0 usually means tracking hadn't started yet, not that ₹0
        // was spent, so it shouldn't drag the baseline/anomaly math down.
        const qualifyingPast = prevMonthDates
            .map((d, i) => ({ d, s: prevSummaries[i] }))
            .filter(({ s }) => s.count > 0);

        // Headline verdict: how this month stacks up against the user's own
        // recent average, not just a single adjacent month — "highest in 5
        // months" says something last-month-only comparisons can't.
        const baseline = qualifyingPast.length >= 2
            ? (() => {
                const pastNets = qualifyingPast.map(({ s }) => Math.round((s.total - s.cashbackTotal) * 100) / 100);
                const avg = Math.round((pastNets.reduce((a, b) => a + b, 0) / pastNets.length) * 100) / 100;
                const rank = [...pastNets, thisMonthNet].sort((a, b) => b - a).indexOf(thisMonthNet) + 1;
                return { avg, monthsCounted: pastNets.length, rank, totalMonths: pastNets.length + 1 };
            })()
            : null;

        // This month's per-category net spend, and the same for each
        // qualifying past month — the shared basis for the anomaly search,
        // the related-category grouping, and the concentration fact below.
        const thisMonthCategoryNet: Record<string, number> = {};
        for (const b of summary.breakdown) thisMonthCategoryNet[b.name] = Math.round((b.total - b.cashbackTotal) * 100) / 100;
        const pastBreakdownMaps = qualifyingPast.map(({ s }) => {
            const map: Record<string, number> = {};
            for (const b of s.breakdown) map[b.name] = Math.round((b.total - b.cashbackTotal) * 100) / 100;
            return map;
        });

        // Category name -> real id, so the frontend can link straight to a
        // category's page — kept out of what's sent to the AI (it never
        // needs raw UUIDs, only names, for its narrative).
        const categoryIdByName = new Map<string, string>();
        for (const b of summary.breakdown) categoryIdByName.set(b.name, b.categoryId);
        for (const { s } of qualifyingPast) for (const b of s.breakdown) categoryIdByName.set(b.name, b.categoryId);

        // The category that deviates most from ITS OWN historical average
        // (not just vs last month, which can itself have been unusual) —
        // covers both a spike in an existing category and one that
        // appeared/disappeared entirely.
        //
        // Tried grouping categories that merely share a word in their name
        // (e.g. "Arjun Petrol" / "ATH Petrol") as if they were the same
        // thing — that guessed relationships that weren't actually there
        // (two people's fuel spend tracked separately on purpose isn't "one
        // category"), so it's gone. Only combine categories the user has
        // actually told the app are the same via real category data.
        let categoryAnomaly: { name: string; thisMonth: number; historicalAvg: number; monthsCounted: number } | null = null;
        if (qualifyingPast.length >= 2) {
            const allCategoryNames = new Set<string>([
                ...Object.keys(thisMonthCategoryNet),
                ...pastBreakdownMaps.flatMap(m => Object.keys(m)),
            ]);
            let best: { name: string; thisMonth: number; historicalAvg: number; deviation: number } | null = null;
            for (const name of allCategoryNames) {
                const thisVal = thisMonthCategoryNet[name] ?? 0;
                const historicalValues = pastBreakdownMaps.map(m => m[name] ?? 0);
                const avg = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
                const deviation = thisVal - avg;
                const meaningfulThreshold = Math.max(300, avg * 0.4);
                if (Math.abs(deviation) < meaningfulThreshold) continue;
                if (!best || Math.abs(deviation) > Math.abs(best.deviation)) {
                    best = { name, thisMonth: thisVal, historicalAvg: Math.round(avg * 100) / 100, deviation };
                }
            }
            if (best) categoryAnomaly = { name: best.name, thisMonth: best.thisMonth, historicalAvg: best.historicalAvg, monthsCounted: qualifyingPast.length };
        }

        // The category with the single biggest ₹ move vs LAST month only
        // (categoryAnomaly above needs 2+ tracked months of history; this
        // needs just one) — used to link to that category's page even when
        // there isn't enough history yet for the fuller anomaly check.
        let topMoMShiftCategoryName: string | null = null;
        if (prevSummary.count > 0) {
            const prevMonthCategoryNet: Record<string, number> = {};
            for (const b of prevSummary.breakdown) prevMonthCategoryNet[b.name] = Math.round((b.total - b.cashbackTotal) * 100) / 100;
            const names = new Set([...Object.keys(thisMonthCategoryNet), ...Object.keys(prevMonthCategoryNet)]);
            let bestDelta = -1;
            for (const name of names) {
                const delta = Math.abs((thisMonthCategoryNet[name] ?? 0) - (prevMonthCategoryNet[name] ?? 0));
                if (delta > bestDelta) {
                    bestDelta = delta;
                    topMoMShiftCategoryName = name;
                }
            }
        }

        // EVERY day that was a real outlier vs. the user's own average
        // spending day this month — not just the single biggest one. A
        // spontaneous outing or one-off purchase can happen more than once
        // in a month, and each one is worth surfacing on its own; reporting
        // only the single heaviest day would silently drop the rest of that
        // same pattern.
        const dayNetMap = new Map<string, number>();
        for (const e of monthExpenses) {
            const net = Number(e.amount) - Number(e.cashback || 0);
            dayNetMap.set(e.date, (dayNetMap.get(e.date) ?? 0) + net);
        }
        const SPIKE_DAY_THRESHOLD = 2; // at least 2x the average spending day
        const MAX_SPIKE_DAYS = 3; // cap so this doesn't turn into a data dump
        let spikeDays: { date: string; dayLabel: string; net: number; topDescriptions: string[]; spikeMultiple: number }[] = [];
        if (dayNetMap.size >= 3) {
            const avgDayNet = [...dayNetMap.values()].reduce((a, b) => a + b, 0) / dayNetMap.size;
            if (avgDayNet > 0) {
                spikeDays = [...dayNetMap.entries()]
                    .map(([date, net]) => ({ date, net, spikeMultiple: Math.round((net / avgDayNet) * 10) / 10 }))
                    .filter(d => d.spikeMultiple >= SPIKE_DAY_THRESHOLD)
                    .sort((a, b) => b.net - a.net)
                    .slice(0, MAX_SPIKE_DAYS)
                    .map(({ date, net, spikeMultiple }) => {
                        const topDescriptions = monthExpenses
                            .filter(e => e.date === date)
                            .sort((a, b) => Number(b.amount) - Number(a.amount))
                            .slice(0, 2)
                            .map(e => e.description);
                        // Weekday name is what actually jogs memory ("oh
                        // right, that was a Sunday") — a bare yyyy-MM-dd
                        // doesn't. No month name since the analysis is
                        // already scoped to one.
                        const dateObj = new Date(`${date}T00:00:00`);
                        const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                        const dayNum = dateObj.getDate();
                        return {
                            date,
                            dayLabel: `${weekdayName}, the ${dayNum}${ordinalSuffix(dayNum)}`,
                            net: Math.round(net * 100) / 100,
                            topDescriptions,
                            spikeMultiple,
                        };
                    });
            }
        }

        // Individual one-off expenses worth calling out on their own — a
        // single hospital bill or a big repair doesn't need to blow up its
        // whole DAY's total (spikeDays above) to be worth flagging; what
        // makes it unusual is that it's a category the user almost never
        // spends in, or a transaction far bigger than that category's own
        // normal one-off. Reuses the same per-category history already
        // built for categoryAnomaly, just at transaction- rather than
        // month-total granularity.
        const pastCategoryTxnStats = new Map<string, { totalNet: number; totalCount: number; monthsUsed: number }>();
        for (const { s } of qualifyingPast) {
            for (const b of s.breakdown) {
                const net = Math.round((b.total - b.cashbackTotal) * 100) / 100;
                const cur = pastCategoryTxnStats.get(b.name) ?? { totalNet: 0, totalCount: 0, monthsUsed: 0 };
                cur.totalNet += net;
                cur.totalCount += b.count;
                if (b.count > 0) cur.monthsUsed += 1;
                pastCategoryTxnStats.set(b.name, cur);
            }
        }
        const UNUSUAL_MIN_AMOUNT = 1000; // floor so small rare-category buys don't qualify
        const RARE_CATEGORY_MAX_MONTHS_USED = 1; // used in at most 1 of the tracked past months
        const BIG_FOR_CATEGORY_MULTIPLE = 3; // vs. that category's own historical avg transaction
        const MAX_UNUSUAL_EXPENSES = 3;
        // Days already flagged as a spike show their own top expenses inline
        // ("mostly X, Y") — re-listing one of those same transactions here
        // as a second, separately-numbered "unusual expense" just repeats
        // what the spike-day entry already said, so skip any day already
        // covered that way.
        const spikeDayDates = new Set(spikeDays.map(d => d.date));
        let unusualExpenses: { id: string; date: string; dayLabel: string; description: string; amount: number; categoryName: string }[] = [];
        if (qualifyingPast.length >= 2) {
            unusualExpenses = monthExpenses
                .map(e => {
                    if (spikeDayDates.has(e.date)) return null;
                    const amount = Number(e.amount);
                    if (amount < UNUSUAL_MIN_AMOUNT) return null;
                    const categoryName = e.category?.name ?? 'Uncategorized';
                    const stats = pastCategoryTxnStats.get(categoryName);
                    const isRareCategory = !stats || stats.monthsUsed <= RARE_CATEGORY_MAX_MONTHS_USED;
                    const historicalAvgTxn = stats && stats.totalCount > 0 ? stats.totalNet / stats.totalCount : null;
                    const isBigForCategory = historicalAvgTxn !== null && historicalAvgTxn > 0 && amount >= historicalAvgTxn * BIG_FOR_CATEGORY_MULTIPLE;
                    if (!isRareCategory && !isBigForCategory) return null;
                    // Rare-category hits rank by raw size; "big for its category" hits
                    // rank by how many multiples over that category's own norm they are
                    // — keeps a ₹50k rare one-off ahead of a ₹5k rare one-off, and a
                    // 10x-normal repair ahead of a barely-3x one.
                    const score = isRareCategory ? amount : amount / (historicalAvgTxn as number);
                    return { e, categoryName, amount, score };
                })
                .filter((x): x is NonNullable<typeof x> => !!x)
                .sort((a, b) => b.score - a.score)
                .slice(0, MAX_UNUSUAL_EXPENSES)
                .map(({ e, categoryName, amount }) => {
                    const dateObj = new Date(`${e.date}T00:00:00`);
                    const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                    const dayNum = dateObj.getDate();
                    return {
                        id: e.id,
                        date: e.date,
                        dayLabel: `${weekdayName}, the ${dayNum}${ordinalSuffix(dayNum)}`,
                        description: e.description,
                        amount: Math.round(amount * 100) / 100,
                        categoryName,
                    };
                });
        }

        // Fewer-but-bigger vs more-but-smaller purchases — a behavior shift
        // that a raw total or category breakdown can't show on its own.
        const transactionSizeShift = prevSummary.count > 0
            ? {
                thisAvg: Math.round((thisMonthNet / summary.count) * 100) / 100,
                prevAvg: Math.round(((prevSummary.total - prevSummary.cashbackTotal) / prevSummary.count) * 100) / 100,
                thisCount: summary.count,
                prevCount: prevSummary.count,
            }
            : null;

        // Top 3 (not just 1) so the AI can call out more than one standout
        // purchase when several exist, instead of only ever the single largest.
        const topTransactions = [...monthExpenses]
            .sort((a, b) => Number(b.amount) - Number(a.amount))
            .slice(0, 3)
            .map(e => ({
                description: e.description,
                amount: Number(e.amount),
                category: e.category?.name ?? 'Uncategorized',
            }));

        // Real day-of-week concentration, computed straight from this
        // month's actual transaction dates — not something the AI infers.
        const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayTotals = new Array(7).fill(0);
        for (const e of monthExpenses) {
            const net = Number(e.amount) - Number(e.cashback || 0);
            dayTotals[new Date(`${e.date}T00:00:00`).getDay()] += net;
        }
        const dayNetTotal = dayTotals.reduce((a, b) => a + b, 0);
        const topDayIdx = dayTotals.reduce((best, v, i) => (v > dayTotals[best] ? i : best), 0);
        const dayOfWeekTop = dayNetTotal > 0 && dayTotals[topDayIdx] > 0
            ? { day: DAY_NAMES[topDayIdx], share: Math.round((dayTotals[topDayIdx] / dayNetTotal) * 100) }
            : null;

        // Time-of-day concentration — only from expenses with an explicitly
        // logged time (never the createdAt fallback used for sorting, which
        // reflects when it was entered, not when it happened).
        const TIME_BUCKETS = [
            { label: 'the morning (5am–12pm)', from: 5, to: 12 },
            { label: 'the afternoon (12pm–5pm)', from: 12, to: 17 },
            { label: 'the evening (5pm–9pm)', from: 17, to: 21 },
            { label: 'late night (9pm–5am)', from: 21, to: 29 }, // wraps past midnight
        ];
        const timedExpenses = monthExpenses.filter(e => e.time);
        const timeTotals = new Array(TIME_BUCKETS.length).fill(0);
        for (const e of timedExpenses) {
            const net = Number(e.amount) - Number(e.cashback || 0);
            let hour = parseInt(e.time!.split(':')[0], 10);
            if (hour < 5) hour += 24;
            const idx = TIME_BUCKETS.findIndex(b => hour >= b.from && hour < b.to);
            if (idx !== -1) timeTotals[idx] += net;
        }
        const timeNetTotal = timeTotals.reduce((a, b) => a + b, 0);
        const topTimeIdx = timeTotals.reduce((best, v, i) => (v > timeTotals[best] ? i : best), 0);
        const timeOfDayTop = timedExpenses.length >= 3 && timeNetTotal > 0 && timeTotals[topTimeIdx] > 0
            ? { label: TIME_BUCKETS[topTimeIdx].label, share: Math.round((timeTotals[topTimeIdx] / timeNetTotal) * 100) }
            : null;

        // Whichever pattern is more pronounced (day-of-week vs time-of-day)
        // is the one worth telling the user about — showing both would be
        // repetitive since they're often two views of the same behavior.
        const timingPattern = dayOfWeekTop && (!timeOfDayTop || dayOfWeekTop.share >= timeOfDayTop.share)
            ? { label: `${dayOfWeekTop.day}s`, share: dayOfWeekTop.share }
            : timeOfDayTop;

        // How concentrated spend is in the top categories — a always-available
        // grounded fact (unlike timing/top-transaction, which can be null).
        const sortedBreakdown = [...summary.breakdown].sort((a, b) => b.total - a.total);
        const topCategoryConcentration = sortedBreakdown.length >= 2 && summary.total > 0
            ? {
                categories: sortedBreakdown.slice(0, 2).map(b => b.name),
                share: Math.round((sortedBreakdown.slice(0, 2).reduce((s, b) => s + b.total, 0) / summary.total) * 100),
            }
            : null;

        const input: MonthAnalysisInput = {
            year,
            month,
            total: thisMonthNet,
            cashbackTotal: summary.cashbackTotal,
            count: summary.count,
            breakdown: summary.breakdown.map(b => ({
                name: b.name,
                net: Math.round((b.total - b.cashbackTotal) * 100) / 100,
                count: b.count,
            })),
            previousMonthNet: prevSummary.count > 0
                ? Math.round((prevSummary.total - prevSummary.cashbackTotal) * 100) / 100
                : null,
            previousBreakdown: prevSummary.breakdown.map(b => ({
                name: b.name,
                net: Math.round((b.total - b.cashbackTotal) * 100) / 100,
            })),
            recentTotals: prevMonthDates
                .map((d, i) => ({ d, s: prevSummaries[i] }))
                .filter(({ s }) => s.count > 0)
                .reverse() // oldest first, for a natural chronological read
                .map(({ d, s }) => ({
                    label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
                    net: Math.round((s.total - s.cashbackTotal) * 100) / 100,
                })),
            topTransactions,
            timingPattern,
            topCategoryConcentration,
            baseline,
            categoryAnomaly,
            spikeDays,
            transactionSizeShift,
            unusualExpenses: unusualExpenses.map(u => ({ dayLabel: u.dayLabel, description: u.description, amount: u.amount, categoryName: u.categoryName })),
        };
        const inputHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

        // Sent alongside the AI's text so the frontend can render an exact,
        // scannable list with a real clickable link to each spike day's
        // actual expenses — computed fresh from this month's data every
        // request, independent of whatever the AI's own wording does or
        // doesn't mention.
        const spikeDayLinks = spikeDays.map(d => ({
            date: d.date,
            dayLabel: d.dayLabel,
            net: d.net,
            spikeMultiple: d.spikeMultiple,
            topDescriptions: d.topDescriptions,
        }));

        // Same idea as spikeDayLinks, but a deep link straight to the actual
        // expense (its edit page) rather than just the day it fell on — this
        // is a single specific transaction, not a day's worth of them.
        const unusualExpenseLinks = unusualExpenses.map(u => ({
            id: u.id,
            date: u.date,
            dayLabel: u.dayLabel,
            description: u.description,
            amount: u.amount,
            categoryName: u.categoryName,
        }));

        // Every category the analysis actually discusses (the anomaly, the
        // biggest MoM mover, and the concentration categories), resolved to
        // real ids and deduped, so the frontend can link straight to each
        // one's page — same idea as the spike-day links above.
        const categoryLinkNames = [
            categoryAnomaly?.name,
            topMoMShiftCategoryName,
            ...(topCategoryConcentration?.categories ?? []),
        ].filter((name): name is string => !!name);
        const categoryLinks = [...new Map(
            categoryLinkNames
                .map(name => ({ name, categoryId: categoryIdByName.get(name) }))
                .filter((c): c is { name: string; categoryId: string } => !!c.categoryId && c.categoryId !== 'uncategorized')
                .map(c => [c.categoryId, c] as const),
        ).values()].slice(0, 4);

        // force=true (the explicit "Re-analyze" action) always asks the AI
        // again, even if the underlying numbers are unchanged — otherwise
        // "re-analyze" silently returns the exact same cached points, which
        // reads as broken rather than as an accurate no-change result.
        const force = req.query.force === 'true';
        const cached = force ? null : await service.getCachedInsight(year, month, inputHash);
        if (cached) {
            res.json({ points: cached.points, cached: true, generatedAt: cached.generatedAt, spikeDays: spikeDayLinks, unusualExpenses: unusualExpenseLinks, categories: categoryLinks });
            return;
        }

        if (!process.env.GEMINI_API_KEY) {
            log.error('gemini: GEMINI_API_KEY not configured');
            res.status(503).json({ message: 'AI analysis not configured' });
            return;
        }

        const generated = await aiService.analyzeMonth(input);
        const generatedAt = await service.saveInsight(year, month, inputHash, generated);
        res.json({ points: generated, cached: false, generatedAt, spikeDays: spikeDayLinks, unusualExpenses: unusualExpenseLinks, categories: categoryLinks });
    };

    // Same 4 buckets used by the AI analysis's timing-pattern signal — kept
    // separate (not imported) since that one lives in a per-request local,
    // not something shared across the file.
    private readonly missedCheckBuckets = [
        { key: 'morning', label: 'morning', from: 5, to: 12 },
        { key: 'afternoon', label: 'afternoon', from: 12, to: 17 },
        { key: 'evening', label: 'evening', from: 17, to: 21 },
        { key: 'night', label: 'late night', from: 21, to: 29 }, // wraps past midnight
    ];

    private bucketForHour = (hour: number) => {
        const h = hour < 5 ? hour + 24 : hour;
        return this.missedCheckBuckets.find(b => h >= b.from && h < b.to) ?? null;
    };

    private parseHour = (time: string) => parseInt(time.split(':')[0], 10);

    // "Today", "Yesterday", or a weekday+ordinal for anything older — same
    // shape as the AI analysis's spike-day labels.
    private dayLabelFor = (date: string, today: string, yesterday: string) => {
        if (date === today) return 'Today';
        if (date === yesterday) return 'Yesterday';
        const dateObj = new Date(`${date}T00:00:00`);
        const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const dayNum = dateObj.getDate();
        return `${weekdayName}, the ${dayNum}${ordinalSuffix(dayNum)}`;
    };

    // "You usually log something in this category around this time of day,
    // most days — and that window has already passed with nothing logged"
    // — a plain frequency check per category+time-bucket, no AI involved.
    // Deliberately per-category + time-of-day rather than exact
    // description/amount match: the point is catching a HABIT (e.g. a
    // morning tea) even when what's bought or spent varies day to day.
    //
    // The client holds a "caught up through" cursor — a (date, bucket)
    // position, passed as ?sinceDate&sinceBucket — and only positions
    // strictly AFTER it are ever returned. It only ever moves forward, and
    // only in response to an explicit user action (adding or discarding one
    // suggestion advances it to that suggestion's own position; a "mark
    // everything covered" action jumps it to the newest position currently
    // shown) — never just from opening/viewing the list. Everything at or
    // before the cursor is treated as resolved from then on, even entries
    // that were never individually looked at — the tradeoff the user chose
    // over per-item tracking, on the assumption the list is worked through
    // in order. No cursor supplied (or one older than MAX_BACKFILL_DAYS) —
    // falls back to that fixed backfill cap.
    getMissedExpenses = async (req: Request, res: Response) => {
        const { dateString: today, hour: currentHour } = getISTParts();
        const { yesterday } = getRelativeDateHints();

        const MAX_BACKFILL_DAYS = 14;
        const earliestAllowedDate = new Date(`${today}T00:00:00`);
        earliestAllowedDate.setDate(earliestAllowedDate.getDate() - MAX_BACKFILL_DAYS);
        const earliestAllowed = earliestAllowedDate.toISOString().slice(0, 10);

        const isValidIsoDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
        const sinceDateParam = req.query.sinceDate as string | undefined;
        const sinceBucketParam = req.query.sinceBucket as string | undefined;
        const since = isValidIsoDate(sinceDateParam) && sinceDateParam! > earliestAllowed ? sinceDateParam! : earliestAllowed;
        // The bucket half of the cursor only makes sense paired with its own
        // date — if the date got clamped up to earliestAllowed above, start
        // that date from its first bucket rather than honoring a bucket
        // index that belonged to a different (older) date. And NEVER honor
        // it for today specifically, however it got there (a stale cursor
        // saved by an older client, a bad request, anything) — today isn't
        // over yet, so whether a bucket counts as "missed" must only ever
        // come from the real current time (checked below), never a stored
        // position. Without this, a cursor pointing at today could
        // permanently suppress its own afternoon/night checks for the rest
        // of the day even though nothing about them was actually resolved.
        const sinceBucketIndex = since === sinceDateParam && since !== today
            ? this.missedCheckBuckets.findIndex(b => b.key === sinceBucketParam)
            : -1;

        // Training window: the 30 days strictly BEFORE `since` — never the
        // days being checked, so backfilling a long gap never erodes the
        // pattern it's being checked against.
        const TRAINING_DAYS = 30;
        const trainingEnd = new Date(`${since}T00:00:00`);
        trainingEnd.setDate(trainingEnd.getDate() - 1);
        const trainingEndStr = trainingEnd.toISOString().slice(0, 10);
        const trainingStart = new Date(`${trainingEndStr}T00:00:00`);
        trainingStart.setDate(trainingStart.getDate() - TRAINING_DAYS);
        const trainingStartStr = trainingStart.toISOString().slice(0, 10);

        const [trainingExpenses, checkRangeExpenses] = trainingEndStr >= trainingStartStr
            ? await Promise.all([
                service.getByDateRange(trainingStartStr, trainingEndStr),
                service.getByDateRange(since, today),
            ])
            : [[], await service.getByDateRange(since, today)];

        if (trainingExpenses.length === 0) {
            res.json({ items: [], since });
            return;
        }

        // Bound the "how many days should this have happened" denominator by
        // when tracking in this window actually started — a user who only
        // started logging 10 days ago shouldn't have their morning-tea
        // frequency diluted by 20 days of no data at all.
        const earliestTrainingDate = trainingExpenses.reduce((min, e) => (e.date < min ? e.date : min), trainingExpenses[0].date);
        const totalTrainingDays = Math.round(
            (new Date(`${trainingEndStr}T00:00:00`).getTime() - new Date(`${earliestTrainingDate}T00:00:00`).getTime()) / 86_400_000,
        ) + 1;

        type Group = {
            categoryId: string;
            categoryName: string;
            categoryIcon: string;
            bucket: typeof this.missedCheckBuckets[number];
            dates: Set<string>;
            amounts: number[];
            descriptions: string[];
            minutesOfDay: number[];
        };
        const groups = new Map<string, Group>();
        for (const e of trainingExpenses) {
            if (!e.time || !e.category) continue;
            const hour = this.parseHour(e.time);
            const bucket = this.bucketForHour(hour);
            if (!bucket) continue;
            const key = `${e.category.id}::${bucket.key}`;
            const g = groups.get(key) ?? {
                categoryId: e.category.id,
                categoryName: e.category.name,
                categoryIcon: e.category.icon,
                bucket,
                dates: new Set<string>(),
                amounts: [],
                descriptions: [],
                minutesOfDay: [],
            };
            g.dates.add(e.date);
            g.amounts.push(Number(e.amount));
            g.descriptions.push(e.description);
            g.minutesOfDay.push(hour * 60 + parseInt(e.time.split(':')[1], 10));
            groups.set(key, g);
        }

        const isCoveredOnDate = (date: string, categoryId: string, bucketKey: string) =>
            checkRangeExpenses.some(e => {
                if (e.date !== date || e.category?.id !== categoryId) return false;
                if (!e.time) return true; // logged without a time — don't nag about "when", just that it happened
                return this.bucketForHour(this.parseHour(e.time))?.key === bucketKey;
            });

        const MIN_OCCURRENCES = 5;
        const MIN_FREQUENCY = 0.5; // present at least half the tracked days
        const MIN_WINDOW_DAYS = 10; // need enough history to trust the pattern
        const MAX_SUGGESTIONS = 20;

        const habits = [...groups.values()]
            .map(g => {
                const frequency = totalTrainingDays > 0 ? g.dates.size / totalTrainingDays : 0;
                if (totalTrainingDays < MIN_WINDOW_DAYS) return null;
                if (g.dates.size < MIN_OCCURRENCES || frequency < MIN_FREQUENCY) return null;

                const typicalAmount = Math.round((g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length) * 100) / 100;
                const descCounts = new Map<string, number>();
                for (const d of g.descriptions) descCounts.set(d, (descCounts.get(d) ?? 0) + 1);
                const typicalDescription = [...descCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
                const avgMinutes = g.minutesOfDay.reduce((a, b) => a + b, 0) / g.minutesOfDay.length;
                const wrappedMinutes = ((Math.round(avgMinutes) % 1440) + 1440) % 1440;
                const suggestedTime = `${Math.floor(wrappedMinutes / 60).toString().padStart(2, '0')}:${(wrappedMinutes % 60).toString().padStart(2, '0')}`;

                return {
                    categoryId: g.categoryId,
                    categoryName: g.categoryName,
                    categoryIcon: g.categoryIcon,
                    bucket: g.bucket,
                    typicalAmount,
                    typicalDescription,
                    suggestedTime,
                    frequencyPct: Math.round(frequency * 100),
                };
            })
            .filter((h): h is NonNullable<typeof h> => !!h);

        const checkDates: string[] = [];
        for (let d = new Date(`${since}T00:00:00`); d <= new Date(`${today}T00:00:00`); d.setDate(d.getDate() + 1)) {
            checkDates.push(d.toISOString().slice(0, 10));
        }
        const currentHourAdjusted = currentHour < 5 ? currentHour + 24 : currentHour;

        const suggestions = checkDates.flatMap(date => {
            const isToday = date === today;
            return habits
                // A past day is fully over — every bucket applies. Today only
                // counts a bucket once its window has actually passed —
                // otherwise "missing" just means "not yet", not "skipped".
                .filter(h => (isToday ? currentHourAdjusted >= h.bucket.to : true))
                .filter(h => date !== since || this.missedCheckBuckets.indexOf(h.bucket) > sinceBucketIndex)
                .filter(h => !isCoveredOnDate(date, h.categoryId, h.bucket.key))
                .map(h => ({
                    date,
                    dayLabel: this.dayLabelFor(date, today, yesterday),
                    categoryId: h.categoryId,
                    categoryName: h.categoryName,
                    categoryIcon: h.categoryIcon,
                    bucketKey: h.bucket.key,
                    bucketLabel: h.bucket.label,
                    typicalAmount: h.typicalAmount,
                    typicalDescription: h.typicalDescription,
                    suggestedTime: h.suggestedTime,
                    frequencyPct: h.frequencyPct,
                }));
        })
            // Oldest first, then in time-of-day order within a day — so the
            // list reads as one chronological sequence to work through.
            .sort((a, b) => {
                if (a.date !== b.date) return a.date < b.date ? -1 : 1;
                return this.missedCheckBuckets.findIndex(bk => bk.key === a.bucketKey)
                    - this.missedCheckBuckets.findIndex(bk => bk.key === b.bucketKey);
            })
            .slice(0, MAX_SUGGESTIONS);

        res.json({ items: suggestions, since });
    };

    getByCategoryYear = async (req: Request, res: Response) => {
        const categoryId = req.query.categoryId as string | undefined;
        if (!categoryId) {
            res.status(400).json({ message: 'categoryId is required' });
            return;
        }

        const startParam = req.query.start as string | undefined;
        const endParam = req.query.end as string | undefined;
        let start: string;
        let end: string;
        if (startParam && endParam) {
            start = startParam;
            end = endParam;
        } else {
            const { year: istYear } = getISTParts();
            const year = parseInt(req.query.year as string) || istYear;
            start = `${year}-01-01`;
            end = `${year}-12-31`;
        }

        const [category, data] = await Promise.all([
            categoryService.getById(categoryId),
            service.getByCategoryRange(categoryId, start, end),
        ]);
        res.json({ category, ...data });
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

    parseText = async (req: Request, res: Response) => {
        const { text } = req.body as { text: string };
        if (!process.env.GEMINI_API_KEY) {
            log.error('gemini: GEMINI_API_KEY not configured');
            res.status(503).json({ message: 'AI parsing not configured' });
            return;
        }
        let categories: { id: string; name: string; icon: string }[] = [];
        try {
            categories = (await categoryService.getAll()).map(c => ({ id: c.id, name: c.name, icon: c.icon }));
        } catch (err) {
            log.error('parseText: failed to fetch categories', { error: String(err) });
        }
        const debug = req.query.debug === 'true';
        res.json(await aiService.parseText(text, categories, debug));
    };


    parseBulkText = async (req: Request, res: Response) => {
        const { text } = req.body as { text: string };
        if (!process.env.GEMINI_API_KEY) {
            log.error('gemini: GEMINI_API_KEY not configured');
            res.status(503).json({ message: 'AI parsing not configured' });
            return;
        }
        let categories: { id: string; name: string; icon: string }[] = [];
        try {
            categories = (await categoryService.getAll()).map(c => ({ id: c.id, name: c.name, icon: c.icon }));
        } catch (err) {
            log.error('parseBulkText: failed to fetch categories', { error: String(err) });
        }
        const debug = req.query.debug === 'true';
        res.json(await aiService.parseBulkText(text, categories, debug));
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

        let categories: { id: string; name: string; icon: string }[] = [];
        try {
            const cats = await categoryService.getAll();
            categories = cats.map(c => ({ id: c.id, name: c.name, icon: c.icon }));
        } catch (err) {
            log.error('parseImage: failed to fetch categories', { error: String(err) });
        }

        const debug = req.query.debug === 'true';
        const parsed = await aiService.parseReceipt(base64, mimeType, categories, debug);
        res.json(parsed);
    };
}
