import { Request, Response } from 'express';
import { ExpenseService } from './expense.service';
import { CategoryService } from '../categories/category.service';
import { ExpenseAiService } from './expense.ai.service';

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
        const year = parseInt(req.query.year as string) || new Date().getFullYear();
        const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
        const categoryId = req.query.categoryId as string | undefined;
        res.json(await service.getByMonth(year, month, categoryId));
    };

    getMonthlySummary = async (req: Request, res: Response) => {
        const year = parseInt(req.query.year as string) || new Date().getFullYear();
        const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
        res.json(await service.getMonthlySummary(year, month));
    };

    getAnalytics = async (req: Request, res: Response) => {
        const months = parseInt(req.query.months as string) || 6;
        res.json(await service.getAnalytics(months));
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
