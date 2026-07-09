import { Router } from 'express';
import { hostingController } from '../controllers/hostingController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);
router.post('/trigger-audit', hostingController.triggerAudit);
router.post('/sync-caddy', hostingController.syncAllCaddy);

export default router;
