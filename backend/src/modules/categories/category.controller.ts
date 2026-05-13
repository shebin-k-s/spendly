import { Request, Response } from 'express';
import { CategoryService } from './category.service';

const service = new CategoryService();

export class CategoryController {
    getAll = async (_req: Request, res: Response) => {
        res.json(await service.getAll());
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

    seedDefaults = async (_req: Request, res: Response) => {
        res.json(await service.seedDefaults());
    };
}
