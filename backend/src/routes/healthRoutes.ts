import { Router, Request, Response } from 'express';
import { query } from '../config/db';
import { mailcowService } from '../services/mailcowService';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  let externalStatus = 'unavailable';
  let diskStatus = 'ok';

  // 1. Check Database
  try {
    await query('SELECT 1');
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'disconnected';
  }

  // 2. Check Mailcow (external service status)
  try {
    const mcStatus = await mailcowService.getStatus();
    if (mcStatus && mcStatus.connected) {
      externalStatus = 'available';
    }
  } catch (err) {
    externalStatus = 'unavailable';
  }

  // 3. Check Disk Space (basic check)
  try {
    const tempDir = os.tmpdir();
    const stats = fs.statSync(tempDir);
    if (stats) {
      // In a real system, you can use check-disk-space or similar,
      // but for single-instance lightweight setup, if tempDir is writeable, it is 'ok'.
      // We can also verify that we can write a small temp file.
      const testFile = path.join(tempDir, `health_test_${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      diskStatus = 'ok';
    }
  } catch (err) {
    diskStatus = 'low_space_or_read_only';
  }

  const isHealthy = dbStatus === 'connected' && diskStatus === 'ok';

  res.status(isHealthy ? 200 : 500).json({
    status: isHealthy ? 'healthy' : 'unhealthy'
  });
});

export default router;
