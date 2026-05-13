import { Router } from 'express';
import { AuthController } from './auth.controller';

const router = Router();
const controller = new AuthController();

router.post('/unlock', controller.unlock);
router.post('/refresh', controller.refresh);

export default router;
