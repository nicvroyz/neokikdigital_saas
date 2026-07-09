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
router.post('/migrations/upload', uploadMiddleware.array('files', 5), infrastructureController.uploadBackup);
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
router.get('/clients/:id/emails', infrastructureController.getClientEmails);
router.post('/clients/:id/email', infrastructureController.createEmailAccount);
router.delete('/clients/:id/email/:address', infrastructureController.deleteEmailAccount);

export default router;
