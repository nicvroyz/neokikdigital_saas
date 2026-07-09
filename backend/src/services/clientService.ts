import { query } from '../config/db';
import { hostingService } from './hostingService';
import { config } from '../config/env';

export interface ClientData {
  id?: string;
  name: string;
  company_name?: string;
  email: string;
  phone?: string;
  domain: string;
  subdomain?: string;
  service_type: 'WEB_HOSTING' | 'MAINTENANCE' | 'HOSTING_AND_MAINTENANCE' | 'CUSTOM';
  plan_interval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  amount_per_period: number;
  currency?: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  last_payment_date: string;
  expiration_date: string;
  grace_period_days?: number;
  doc_root?: string;
  notes?: string;
}

export const clientService = {
  async getAllClients(statusFilter?: string, searchQuery?: string) {
    let sql = 'SELECT * FROM clients WHERE 1=1';
    const params: any[] = [];

    if (statusFilter && statusFilter !== 'ALL') {
      params.push(statusFilter);
      sql += ` AND status = $${params.length}`;
    }

    if (searchQuery) {
      params.push(`%${searchQuery}%`);
      sql += ` AND (name ILIKE $${params.length} OR domain ILIKE $${params.length} OR email ILIKE $${params.length} OR company_name ILIKE $${params.length})`;
    }

    sql += ' ORDER BY created_at DESC';
    const res = await query(sql, params);
    return res.rows;
  },

  async getClientById(id: string) {
    const res = await query('SELECT * FROM clients WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    
    const client = res.rows[0];
    const paymentsRes = await query('SELECT * FROM payment_records WHERE client_id = $1 ORDER BY paid_at DESC', [id]);
    client.payment_history = paymentsRes.rows;

    const logsRes = await query('SELECT * FROM notification_logs WHERE client_id = $1 ORDER BY sent_at DESC LIMIT 10', [id]);
    client.notifications = logsRes.rows;

    return client;
  },

  async createClient(data: ClientData) {
    const sanitizedDomain = data.domain.replace(/[^a-z0-9.-]/gi, '_');
    const docRoot = data.doc_root || `${config.infrastructure.clientSitesPath}/${sanitizedDomain}`;
    const status = data.status || 'ACTIVE';
    const graceDays = data.grace_period_days !== undefined ? data.grace_period_days : 5;

    const res = await query(
      `INSERT INTO clients (
        name, company_name, email, phone, domain, subdomain, service_type,
        plan_interval, amount_per_period, currency, status, last_payment_date,
        expiration_date, grace_period_days, doc_root, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        data.name, data.company_name || null, data.email, data.phone || null,
        data.domain, data.subdomain || null, data.service_type,
        data.plan_interval, data.amount_per_period, data.currency || 'USD',
        status, data.last_payment_date, data.expiration_date, graceDays, docRoot, data.notes || null
      ]
    );

    const createdClient = res.rows[0];
    // Sync Caddy config
    await hostingService.applyCaddyConfig(createdClient.domain, createdClient.doc_root, createdClient.status === 'SUSPENDED');

    return createdClient;
  },

  async updateClient(id: string, data: Partial<ClientData>) {
    const fields: string[] = [];
    const params: any[] = [id];

    Object.keys(data).forEach((key) => {
      if (key !== 'id' && data[key as keyof ClientData] !== undefined) {
        params.push(data[key as keyof ClientData]);
        fields.push(`${key} = $${params.length}`);
      }
    });

    if (fields.length === 0) return this.getClientById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    const sql = `UPDATE clients SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const res = await query(sql, params);
    
    if (res.rows.length > 0) {
      const client = res.rows[0];
      await hostingService.applyCaddyConfig(client.domain, client.doc_root, client.status === 'SUSPENDED');
    }

    return res.rows[0];
  },

  async renewSubscription(id: string, amount: number, paymentMethod: string = 'MANUAL_TRANSFER', notes?: string) {
    const clientRes = await query('SELECT * FROM clients WHERE id = $1', [id]);
    if (clientRes.rows.length === 0) throw new Error('Client not found');

    const client = clientRes.rows[0];
    const currentExp = new Date(client.expiration_date > new Date() ? client.expiration_date : new Date());

    // Calculate next expiration date
    let newExp = new Date(currentExp);
    switch (client.plan_interval) {
      case 'MONTHLY':
        newExp.setMonth(newExp.getMonth() + 1);
        break;
      case 'QUARTERLY':
        newExp.setMonth(newExp.getMonth() + 3);
        break;
      case 'SEMI_ANNUAL':
        newExp.setMonth(newExp.getMonth() + 6);
        break;
      case 'ANNUAL':
        newExp.setFullYear(newExp.getFullYear() + 1);
        break;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const newExpStr = newExp.toISOString().split('T')[0];

    // Record Payment
    await query(
      `INSERT INTO payment_records (client_id, amount, currency, paid_at, period_start, period_end, payment_method, notes)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
      [id, amount, client.currency, todayStr, newExpStr, paymentMethod, notes || 'Subscription renewal']
    );

    // Reactivate Client to ACTIVE & update dates
    const updatedRes = await query(
      `UPDATE clients SET
        status = 'ACTIVE',
        last_payment_date = $2,
        expiration_date = $3,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, todayStr, newExpStr]
    );

    const updatedClient = updatedRes.rows[0];
    // Re-apply Caddy config to reactivate live website
    await hostingService.applyCaddyConfig(updatedClient.domain, updatedClient.doc_root, false);

    return updatedClient;
  },

  async deleteClient(id: string) {
    const client = await this.getClientById(id);
    if (!client) return false;

    await query('DELETE FROM clients WHERE id = $1', [id]);
    return true;
  }
};
