import { Router } from 'express';
import { communicationsController } from '../controllers/communicationsController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/campaigns', communicationsController.getCampaigns);
router.get('/campaigns/:id', communicationsController.getCampaignById);
router.post('/campaigns', communicationsController.createCampaign);
router.post('/campaigns/:id/send', communicationsController.sendCampaign);
router.get('/whatsapp/status', communicationsController.getWhatsAppStatus);

export default router;
