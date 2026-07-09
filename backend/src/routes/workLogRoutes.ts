import { Router } from 'express';
import { workLogController } from '../controllers/workLogController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', workLogController.getAll);
router.post('/', workLogController.create);
router.delete('/:id', workLogController.delete);

export default router;
