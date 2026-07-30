import { Request, Response } from 'express';
import { WebauthnService } from './webauthn.service';
import { ApiError } from '../../common/middlewares/error.middleware';

const service = new WebauthnService();

function requireRequestId(req: Request): string {
    const { requestId } = req.body as { requestId?: string };
    if (!requestId) throw new ApiError('requestId is required', 400);
    return requestId;
}

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
        const requestId = requireRequestId(req);
        const { deviceName } = req.body as { deviceName?: string };
        res.json(await service.generateChallenge(requestId, deviceName));
    };

    registerVerify = async (req: Request, res: Response) => {
        const requestId = requireRequestId(req);
        const { response, deviceName } = req.body as { response: any; deviceName?: string };
        res.json(await service.verifyRegistration(requestId, response, deviceName));
    };

    authVerify = async (req: Request, res: Response) => {
        const requestId = requireRequestId(req);
        const { response } = req.body as { response: any };
        res.json(await service.verifyAuthentication(requestId, response));
    };
}
