import { Request, Response } from 'express';
import { ExpenseService } from './expense.service';

const service = new ExpenseService();

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
        res.json(await service.getById(req.params.id));
    };

    create = async (req: Request, res: Response) => {
        res.status(201).json(await service.create(req.body));
    };

    update = async (req: Request, res: Response) => {
        res.json(await service.update(req.params.id, req.body));
    };

    delete = async (req: Request, res: Response) => {
        await service.delete(req.params.id);
        res.sendStatus(204);
    };
}
