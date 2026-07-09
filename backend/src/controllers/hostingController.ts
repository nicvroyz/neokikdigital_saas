import { Request, Response } from 'express';
import { cronService } from '../services/cronService';
import { query } from '../config/db';
import { hostingService } from '../services/hostingService';

export const hostingController = {
  async triggerAudit(req: Request, res: Response) {
    try {
      await cronService.runLifecycleAudit();
      return res.json({ message: 'Lifecycle audit completed successfully' });
    } catch (err) {
      console.error('Error triggering audit:', err);
      return res.status(500).json({ error: 'Audit execution failed' });
    }
  },

  async syncAllCaddy(req: Request, res: Response) {
    try {
      const clientsRes = await query('SELECT * FROM clients');
      for (const client of clientsRes.rows) {
        await hostingService.applyCaddyConfig(client.domain, client.doc_root, client.status === 'SUSPENDED');
      }
      return res.json({ message: `Synced Caddy configurations for ${clientsRes.rows.length} clients.` });
    } catch (err) {
      console.error('Error syncing Caddy:', err);
      return res.status(500).json({ error: 'Caddy sync failed' });
    }
  }
};
