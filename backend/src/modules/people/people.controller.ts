import { Request, Response } from 'express';
import { PeopleService } from './people.service';

const service = new PeopleService();

export class PeopleController {
    getAll = async (req: Request, res: Response) => {
        res.json(await service.getAll());
    };

    getById = async (req: Request, res: Response) => {
        res.json(await service.getById(req.params.id as string));
    };

    createPerson = async (req: Request, res: Response) => {
        res.status(201).json(await service.createPerson(req.body));
    };

    updatePerson = async (req: Request, res: Response) => {
        res.json(await service.updatePerson(req.params.id as string, req.body));
    };

    deletePerson = async (req: Request, res: Response) => {
        await service.deletePerson(req.params.id as string);
        res.sendStatus(204);
    };

    addTransaction = async (req: Request, res: Response) => {
        res.status(201).json(await service.addTransaction(req.params.id as string, req.body));
    };

    deleteTransaction = async (req: Request, res: Response) => {
        await service.deleteTransaction(req.params.transactionId as string);
        res.sendStatus(204);
    };

}
