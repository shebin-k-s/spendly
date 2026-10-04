import { Request, Response } from 'express';
import { MerchantRuleService } from './merchant-rule.service';

const service = new MerchantRuleService();

export class MerchantRuleController {
    getAll = async (req: Request, res: Response) => {
        res.json(await service.getAll());
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
}
