import { Request, Response } from 'express';
import { WebauthnService } from './webauthn.service';

const service = new WebauthnService();

export class WebauthnController {
    getStatus = async (req: Request, res: Response) => {
        res.json(await service.getStatus());
    };

    listDevices = async (req: Request, res: Response) => {
        res.json(await service.listDevices());
    };

    deleteDevice = async (req: Request, res: Response) => {
        await service.deleteDevice(req.params.id as string);
        res.sendStatus(204);
    };

    challenge = async (req: Request, res: Response) => {
        const { deviceName } = req.body as { deviceName?: string };
        res.json(await service.generateChallenge(deviceName));
    };

    registerOptions = async (req: Request, res: Response) => {
        const { deviceName } = req.body as { deviceName?: string };
        res.json(await service.generateRegistration(deviceName));
    };

    registerVerify = async (req: Request, res: Response) => {
        const { response, deviceName } = req.body as { response: any; deviceName?: string };
        res.json(await service.verifyRegistration(response, deviceName));
    };

    authOptions = async (req: Request, res: Response) => {
        res.json(await service.generateAuthentication());
    };

    authVerify = async (req: Request, res: Response) => {
        const { response } = req.body as { response: any };
        res.json(await service.verifyAuthentication(response));
    };
}
