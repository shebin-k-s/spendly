import { Router } from 'express';
import { CategoryGroupController } from './categoryGroup.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import { categoryGroupSchema } from './categoryGroup.validations';

const router = Router();
const controller = new CategoryGroupController();

router.get('/', controller.getAll);
router.post('/', validate(categoryGroupSchema), controller.create);
router.put('/:id', validate(categoryGroupSchema), controller.update);
router.delete('/:id', controller.delete);

export default router;
