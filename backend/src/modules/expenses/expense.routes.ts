import { Router } from 'express';
import { ExpenseController } from './expense.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import { createExpenseSchema, updateExpenseSchema } from './expense.validations';

const router = Router();
const controller = new ExpenseController();

router.get('/', controller.getByMonth);
router.get('/summary', controller.getMonthlySummary);
router.get('/analytics', controller.getAnalytics);
router.get('/:id', controller.getById);
router.post('/', validate(createExpenseSchema), controller.create);
router.put('/:id', validate(updateExpenseSchema), controller.update);
router.delete('/:id', controller.delete);

export default router;
