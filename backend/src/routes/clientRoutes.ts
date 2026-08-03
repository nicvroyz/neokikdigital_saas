import { Router } from 'express';
import { clientController } from '../controllers/clientController';
import { clientResourcesController } from '../controllers/clientResourcesController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', clientController.getAll);
router.get('/:id', clientController.getById);
router.post('/', clientController.create);
router.put('/:id', clientController.update);
router.post('/:id/renew', clientController.renew);
router.delete('/:id', clientController.delete);

// Client-scoped Mailcow resources (emails, domains, aliases) — all filtered by client.domain.
router.get('/:id/emails', clientResourcesController.getClientEmails);
router.post('/:id/emails', clientResourcesController.createEmailAccount);
router.patch('/:id/emails/:address', clientResourcesController.updateEmailAccount);
router.delete('/:id/emails/:address', clientResourcesController.deleteEmailAccount);

router.get('/:id/domains', clientResourcesController.getClientDomains);
router.post('/:id/domains', clientResourcesController.createClientDomain);
router.delete('/:id/domains/:domain', clientResourcesController.deleteClientDomain);

router.get('/:id/aliases', clientResourcesController.getClientAliases);
router.post('/:id/aliases', clientResourcesController.createClientAlias);
router.delete('/:id/aliases/:address', clientResourcesController.deleteClientAlias);

export default router;
