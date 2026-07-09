import { Router } from 'express';
import { clientController } from '../controllers/clientController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', clientController.getAll);
router.get('/:id', clientController.getById);
router.post('/', clientController.create);
router.put('/:id', clientController.update);
router.post('/:id/renew', clientController.renew);
router.delete('/:id', clientController.delete);

export default router;
