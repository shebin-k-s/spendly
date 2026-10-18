import { Request, Response } from 'express';
import { CategoryGroupService } from './categoryGroup.service';

const service = new CategoryGroupService();

export class CategoryGroupController {
    getAll = async (_req: Request, res: Response) => {
        res.json(await service.getAll());
    };

    create = async (req: Request, res: Response) => {
        res.status(201).json(await service.create(req.body.name));
    };

    update = async (req: Request, res: Response) => {
        res.json(await service.update(req.params.id as string, req.body.name));
    };

    delete = async (req: Request, res: Response) => {
        await service.delete(req.params.id as string);
        res.sendStatus(204);
    };
}
