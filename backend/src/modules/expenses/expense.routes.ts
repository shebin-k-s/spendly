import { Router } from 'express';
import multer from 'multer';
import { ExpenseController } from './expense.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import { createExpenseSchema, updateExpenseSchema, parseTextSchema, parseBulkTextSchema } from './expense.validations';

const router = Router();
const controller = new ExpenseController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', controller.getByMonth);
router.get('/summary', controller.getMonthlySummary);
router.get('/analytics', controller.getAnalytics);
router.post('/parse-text', validate(parseTextSchema), controller.parseText);
router.post('/parse-bulk-text', validate(parseBulkTextSchema), controller.parseBulkText);
router.post('/parse-image', upload.single('image'), controller.parseImage);
router.get('/:id', controller.getById);
router.post('/', validate(createExpenseSchema), controller.create);
router.put('/:id', validate(updateExpenseSchema), controller.update);
router.delete('/:id', controller.delete);

export default router;
