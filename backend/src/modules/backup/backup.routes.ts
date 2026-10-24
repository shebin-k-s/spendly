import { Router } from 'express';
import multer from 'multer';
import Joi from 'joi';
import { BackupController, BackupHooksController } from './backup.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import { MAX_BACKUP_BYTES } from './backup.service';

const router = Router();
const controller = new BackupController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BACKUP_BYTES } });

router.get('/summary', controller.summary);
router.get('/export', controller.download);
router.post('/restore', upload.single('file'), controller.restore);

router.get('/drive/status', controller.driveStatus);
router.post('/drive/connect', controller.driveConnect);
router.post('/drive/run', controller.driveRun);
router.put('/drive/auto', validate(Joi.object({ enabled: Joi.boolean().required() })), controller.driveAuto);
router.post('/drive/disconnect', controller.driveDisconnect);

export default router;

// Mounted outside the login check (see app.ts).
const hooks = new BackupHooksController();
export const backupHooksRouter = Router();
backupHooksRouter.get('/drive-callback', hooks.driveCallback);
backupHooksRouter.post('/scheduled', hooks.scheduled);
