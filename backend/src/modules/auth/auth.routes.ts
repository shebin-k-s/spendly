import { Router } from 'express';
import { AuthController } from './auth.controller';

const router = Router();
const controller = new AuthController();

router.post('/unlock', controller.unlock);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);

router.post('/webauthn/challenge', controller.biometricChallenge);
router.post('/webauthn/login', controller.biometricLogin);

export default router;
