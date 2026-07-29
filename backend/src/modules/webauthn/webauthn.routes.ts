import { Router } from 'express';
import { WebauthnController } from './webauthn.controller';

const router = Router();
const controller = new WebauthnController();

router.get('/status', controller.getStatus);
router.post('/challenge', controller.challenge);
router.get('/devices', controller.listDevices);
router.delete('/devices/:id', controller.deleteDevice);
router.post('/register-options', controller.registerOptions);
router.post('/register-verify', controller.registerVerify);
router.post('/auth-options', controller.authOptions);
router.post('/auth-verify', controller.authVerify);

export default router;
