import { Router } from 'express';
import { CategoryController } from './category.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import { createCategorySchema } from './category.validations';

const router = Router();
const controller = new CategoryController();

router.get('/', controller.getAll);
router.post('/seed', controller.seedDefaults);
router.get('/:id', controller.getById);
router.post('/', validate(createCategorySchema), controller.create);
router.put('/:id', validate(createCategorySchema), controller.update);
router.delete('/:id', controller.delete);

export default router;
