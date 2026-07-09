import cron from 'node-cron';
import { query } from '../config/db';
import { mailerService } from './mailerService';
import { hostingService } from './hostingService';

export const cronService = {
  init() {
    console.log('[CRON ENGINE] Subscription lifecycle manager initialized.');
    // Schedule daily check at 00:05 AM
    cron.schedule('5 0 * * *', async () => {
      console.log('[CRON ENGINE] Starting daily subscription lifecycle check...');
      await this.runLifecycleAudit();
    });
  },

  async runLifecycleAudit() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch all clients
      const res = await query('SELECT * FROM clients');
      const clients = res.rows;

      console.log(`[CRON ENGINE] Auditing ${clients.length} clients...`);

      for (const client of clients) {
        const expDate = new Date(client.expiration_date);
        expDate.setHours(0, 0, 0, 0);

        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const graceDays = client.grace_period_days || 5;

        // 1. Check Pre-Expiration Warnings (7 days & 3 days)
        if (diffDays === 7 || diffDays === 3) {
          const logCheck = await query(
            `SELECT * FROM notification_logs WHERE client_id = $1 AND type = $2 AND DATE(sent_at) = CURRENT_DATE`,
            [client.id, `EXPIRATION_${diffDays}_DAYS`]
          );

          if (logCheck.rows.length === 0) {
            const sent = await mailerService.sendExpirationWarning(
              client.email, client.name, client.domain, diffDays, client.expiration_date
            );
            await query(
              `INSERT INTO notification_logs (client_id, type, recipient_email, status, details) VALUES ($1, $2, $3, $4, $5)`,
              [client.id, `EXPIRATION_${diffDays}_DAYS`, client.email, sent ? 'SENT' : 'FAILED', `Pre-expiration alert ${diffDays} days before`]
            );
          }
        }

        // 2. Check Expiration & Grace Period
        if (diffDays <= 0 && Math.abs(diffDays) <= graceDays) {
          if (client.status !== 'EXPIRED') {
            console.log(`[CRON ENGINE] Client ${client.domain} transitioned ACTIVE -> EXPIRED`);
            await query(`UPDATE clients SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [client.id]);
            
            const graceLeft = graceDays - Math.abs(diffDays);
            await mailerService.sendExpiredNotice(client.email, client.name, client.domain, graceLeft);
            await query(
              `INSERT INTO notification_logs (client_id, type, recipient_email, status, details) VALUES ($1, $2, $3, 'SENT', 'Marked EXPIRED, grace period active')`,
              [client.id, 'EXPIRED_NOTICE', client.email]
            );
          }
        }

        // 3. Check Suspension Threshold (Expired beyond Grace Period)
        if (diffDays <= 0 && Math.abs(diffDays) > graceDays) {
          if (client.status !== 'SUSPENDED') {
            console.log(`[CRON ENGINE] Client ${client.domain} EXPIRED -> SUSPENDED (Grace period exceeded)`);
            
            // Mark SUSPENDED in DB
            await query(`UPDATE clients SET status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [client.id]);
            
            // Enforce VPS Caddy Suspension page
            await hostingService.applyCaddyConfig(client.domain, client.doc_root, true);

            // Send Email Notice
            await mailerService.sendSuspendedNotice(client.email, client.name, client.domain);
            await query(
              `INSERT INTO notification_logs (client_id, type, recipient_email, status, details) VALUES ($1, $2, $3, 'SENT', 'Service SUSPENDED due to non-payment')`,
              [client.id, 'SUSPENDED_NOTICE', client.email]
            );
          }
        }
      }

      console.log('[CRON ENGINE] Daily lifecycle audit completed.');
    } catch (err) {
      console.error('[CRON ENGINE ERROR] Error running lifecycle audit:', err);
    }
  }
};
