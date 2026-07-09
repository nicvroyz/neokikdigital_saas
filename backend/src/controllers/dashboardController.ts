import { Request, Response } from 'express';
import { query } from '../config/db';

export const dashboardController = {
  async getSummary(req: Request, res: Response) {
    try {
      const statsRes = await query(`
        SELECT 
          COUNT(*) as total_clients,
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_clients,
          COUNT(CASE WHEN status = 'EXPIRED' THEN 1 END) as expired_clients,
          COUNT(CASE WHEN status = 'SUSPENDED' THEN 1 END) as suspended_clients,
          COALESCE(SUM(CASE 
            WHEN status = 'ACTIVE' AND plan_interval = 'MONTHLY' THEN amount_per_period
            WHEN status = 'ACTIVE' AND plan_interval = 'QUARTERLY' THEN amount_per_period / 3
            WHEN status = 'ACTIVE' AND plan_interval = 'SEMI_ANNUAL' THEN amount_per_period / 6
            WHEN status = 'ACTIVE' AND plan_interval = 'ANNUAL' THEN amount_per_period / 12
            ELSE 0 
          END), 0) as mrr
        FROM clients
      `);

      const upcomingRes = await query(`
        SELECT id, name, domain, status, expiration_date, amount_per_period, currency
        FROM clients
        WHERE expiration_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
        ORDER BY expiration_date ASC
        LIMIT 5
      `);

      const recentPaymentsRes = await query(`
        SELECT pr.id, pr.amount, pr.currency, pr.paid_at, c.name as client_name, c.domain
        FROM payment_records pr
        JOIN clients c ON c.id = pr.client_id
        ORDER BY pr.paid_at DESC
        LIMIT 5
      `);

      return res.json({
        stats: statsRes.rows[0],
        upcoming_renewals: upcomingRes.rows,
        recent_payments: recentPaymentsRes.rows
      });
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      return res.status(500).json({ error: 'Failed to fetch dashboard summary' });
    }
  }
};
