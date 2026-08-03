import { Router } from 'express';
import { infrastructureController } from '../controllers/infrastructureController';
import { authenticateToken } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';

const router = Router();

router.use(authenticateToken);

// Provisioning
router.post('/provision', infrastructureController.createProvision);
router.post('/provision/:id/execute', infrastructureController.executeProvision);
router.get('/provision/:id', infrastructureController.getProvision);
router.get('/provisions', infrastructureController.getAllProvisions);

// Migrations
router.post(
  '/migrations/upload',
  (req, res, next) => {
    req.on('aborted', () => {
      console.log('[UPLOAD DEBUG] request aborted');
    });

    req.on('close', () => {
      console.log('[UPLOAD DEBUG] request closed');
    });

    next();
  },
  (req, res, next) => {
    uploadMiddleware.array('files', 5)(req, res, (err) => {
      if (err) {
        console.error('[UPLOAD DEBUG] multer error:', err);
        return next(err);
      }
      next();
    });
  },
  infrastructureController.uploadBackup
);
router.post('/migrations/:id/analyze', infrastructureController.analyzeBackup);
router.post('/migrations/:id/simulate', infrastructureController.simulateMigration);
router.post('/migrations/:id/execute', infrastructureController.executeMigration);
router.get('/migrations', infrastructureController.getAllMigrations);
router.get('/migrations/:id', infrastructureController.getMigration);
router.get('/migrations/:id/logs', infrastructureController.getMigrationLogs);
router.get('/migrations/:id/stream', infrastructureController.streamMigration);
router.post('/migrations/:id/rollback', infrastructureController.rollbackMigration);
router.delete('/migrations/:id', infrastructureController.deleteMigration);

// DNS
router.get('/dns/:domain', infrastructureController.analyzeDNS);

// SSL
router.post('/ssl/:domain', infrastructureController.issueSSL);

// Server Status
router.get('/server/status', infrastructureController.getServerStatus);
router.get('/server/php-versions', infrastructureController.getPHPVersions);
router.get('/mailcow/status', infrastructureController.getMailcowStatus);

// Backups
router.get('/backups', infrastructureController.getAllBackups);
router.get('/backups/:id/download', infrastructureController.downloadBackup);
router.delete('/backups/:id', infrastructureController.deleteBackup);

// Client Infrastructure Management
router.post('/clients/:id/restart', infrastructureController.restartClient);
router.post('/clients/:id/maintenance', infrastructureController.toggleMaintenance);
router.get('/clients/:id/logs', infrastructureController.getClientLogs);
router.get('/clients/:id/disk-usage', infrastructureController.getClientDiskUsage);
router.post('/clients/:id/db/backup', infrastructureController.backupClientDB);
router.post('/clients/:id/db/optimize', infrastructureController.optimizeClientDB);
// DEPRECATED: email management moved to /api/clients/:id/emails (client-scoped namespace).
// These 307 redirects exist only to avoid breaking any caller still hitting the old path
// during the transition — they preserve method and body. Remove once nothing hits them.
router.get('/clients/:id/emails', (req, res) => {
  console.warn(`[DEPRECATED ROUTE] GET /api/infrastructure/clients/${req.params.id}/emails -> use /api/clients/:id/emails`);
  res.redirect(307, `/api/clients/${req.params.id}/emails`);
});
router.post('/clients/:id/email', (req, res) => {
  console.warn(`[DEPRECATED ROUTE] POST /api/infrastructure/clients/${req.params.id}/email -> use /api/clients/:id/emails`);
  res.redirect(307, `/api/clients/${req.params.id}/emails`);
});
router.patch('/clients/:id/email/:address', (req, res) => {
  console.warn(`[DEPRECATED ROUTE] PATCH /api/infrastructure/clients/${req.params.id}/email/:address -> use /api/clients/:id/emails/:address`);
  res.redirect(307, `/api/clients/${req.params.id}/emails/${req.params.address}`);
});
router.delete('/clients/:id/email/:address', (req, res) => {
  console.warn(`[DEPRECATED ROUTE] DELETE /api/infrastructure/clients/${req.params.id}/email/:address -> use /api/clients/:id/emails/:address`);
  res.redirect(307, `/api/clients/${req.params.id}/emails/${req.params.address}`);
});

export default router;
