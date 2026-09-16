import { Request, Response } from 'express';
import crypto from 'crypto';
import { ExpenseService } from './expense.service';
import { CategoryService } from '../categories/category.service';
import { ExpenseAiService, type MonthAnalysisInput } from './expense.ai.service';
import { getISTParts } from '../../common/utils/date.utils';

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

        // Categories whose names clearly share a theme (e.g. "Family" and
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

        // The single calendar day that drove the most spend, with what was
        // actually bought that day — concrete enough to feel like a real
        // look at behavior, not a rounded-off stat.
        const dayNetMap = new Map<string, number>();
        for (const e of monthExpenses) {
            const net = Number(e.amount) - Number(e.cashback || 0);
            dayNetMap.set(e.date, (dayNetMap.get(e.date) ?? 0) + net);
        }
        let heaviestDay: { date: string; dayLabel: string; net: number; topDescriptions: string[]; avgDayNet: number; spikeMultiple: number } | null = null;
        if (dayNetMap.size >= 2) {
            const [topDate, topNet] = [...dayNetMap.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best));
            if (topNet > 0) {
                const topDescriptions = monthExpenses
                    .filter(e => e.date === topDate)
                    .sort((a, b) => Number(b.amount) - Number(a.amount))
                    .slice(0, 3)
                    .map(e => e.description);
                // Compared against the AVERAGE spending day (across days that
                // had any spend), not the monthly total — so a real spike
                // (e.g. ₹1,000 on a ₹200-a-day month) reads as the outlier it
                // is, not just "the biggest of several similar days."
                const avgDayNet = [...dayNetMap.values()].reduce((a, b) => a + b, 0) / dayNetMap.size;
                // Weekday name is what actually jogs memory ("oh right, that
                // was a Sunday") — a bare yyyy-MM-dd doesn't. No month name
                // here since the whole analysis is already scoped to one.
                const topDateObj = new Date(`${topDate}T00:00:00`);
                const weekdayName = topDateObj.toLocaleDateString('en-US', { weekday: 'long' });
                const dayNum = topDateObj.getDate();
                const dayLabel = `${weekdayName}, the ${dayNum}${ordinalSuffix(dayNum)}`;
                heaviestDay = {
                    date: topDate,
                    dayLabel,
                    net: Math.round(topNet * 100) / 100,
                    topDescriptions,
                    avgDayNet: Math.round(avgDayNet * 100) / 100,
                    spikeMultiple: avgDayNet > 0 ? Math.round((topNet / avgDayNet) * 10) / 10 : 0,
                };
            }
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
            heaviestDay,
            transactionSizeShift,
        };
        const inputHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

        // force=true (the explicit "Re-analyze" action) always asks the AI
        // again, even if the underlying numbers are unchanged — otherwise
        // "re-analyze" silently returns the exact same cached points, which
        // reads as broken rather than as an accurate no-change result.
        const force = req.query.force === 'true';
        const cached = force ? null : await service.getCachedInsight(year, month, inputHash);
        if (cached) {
            res.json({ points: cached.points, cached: true, generatedAt: cached.generatedAt });
            return;
        }

        if (!process.env.GEMINI_API_KEY) {
            log.error('gemini: GEMINI_API_KEY not configured');
            res.status(503).json({ message: 'AI analysis not configured' });
            return;
        }

        const generated = await aiService.analyzeMonth(input);
        const generatedAt = await service.saveInsight(year, month, inputHash, generated);
        res.json({ points: generated, cached: false, generatedAt });
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
