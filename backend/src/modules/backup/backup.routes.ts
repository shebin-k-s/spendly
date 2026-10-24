import { Router } from 'express';
import multer from 'multer';
import { BackupController } from './backup.controller';
import { MAX_BACKUP_BYTES } from './backup.service';

const router = Router();
const controller = new BackupController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BACKUP_BYTES } });

router.get('/summary', controller.summary);
router.get('/export', controller.download);
router.post('/restore', upload.single('file'), controller.restore);

export default router;
