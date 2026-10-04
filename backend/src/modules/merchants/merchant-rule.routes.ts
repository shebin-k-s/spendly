import { Router } from 'express';
import { MerchantRuleController } from './merchant-rule.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import { merchantRuleSchema } from './merchant-rule.validations';

const router = Router();
const controller = new MerchantRuleController();

router.get('/', controller.getAll);
router.post('/', validate(merchantRuleSchema), controller.create);
router.put('/:id', validate(merchantRuleSchema), controller.update);
router.delete('/:id', controller.delete);

export default router;
