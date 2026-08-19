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

        // Previous 3 months (not just 1) — lets the AI tell a real streak
        // ("risen 3 months running") from a one-off blip, not just a single
        // MoM delta. JS Date rolls negative months back a year automatically.
        const prevMonthDates = [1, 2, 3].map(i => new Date(year, month - 1 - i, 1));
        const [prevSummaries, monthExpenses] = await Promise.all([
            Promise.all(prevMonthDates.map(d => service.getMonthlySummary(d.getFullYear(), d.getMonth() + 1))),
            service.getByMonth(year, month),
        ]);
        const [prevSummary] = prevSummaries;

        const topExpense = monthExpenses.reduce<typeof monthExpenses[number] | null>(
            (max, e) => (!max || Number(e.amount) > Number(max.amount)) ? e : max,
            null,
        );

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

        const input: MonthAnalysisInput = {
            year,
            month,
            total: Math.round((summary.total - summary.cashbackTotal) * 100) / 100,
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
            topTransaction: topExpense ? {
                description: topExpense.description,
                amount: Number(topExpense.amount),
                category: topExpense.category?.name ?? 'Uncategorized',
            } : null,
            dayOfWeekTop,
        };
        const inputHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

        const cached = await service.getCachedInsight(year, month, inputHash);
        if (cached) {
            res.json({ points: cached, cached: true });
            return;
        }

        if (!process.env.GEMINI_API_KEY) {
            log.error('gemini: GEMINI_API_KEY not configured');
            res.status(503).json({ message: 'AI analysis not configured' });
            return;
        }

        const generated = await aiService.analyzeMonth(input);
        await service.saveInsight(year, month, inputHash, generated);
        res.json({ points: generated, cached: false });
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
