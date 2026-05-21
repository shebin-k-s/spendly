import { Router } from 'express';
import { PeopleController } from './people.controller';

const router = Router();
const controller = new PeopleController();

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.createPerson);
router.patch('/:id', controller.updatePerson);
router.delete('/:id', controller.deletePerson);

router.post('/:id/transactions', controller.addTransaction);
router.delete('/transactions/:transactionId', controller.deleteTransaction);

export default router;
