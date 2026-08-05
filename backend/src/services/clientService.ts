import { query } from '../config/db';
import { hostingService } from './hostingService';
import { mailcowService } from './mailcowService';
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

// Best-effort: not every client has a real Docker/Caddy site or a Mailcow
// domain behind them (e.g. clients registered manually, never migrated), so
// these syncs legitimately fail for them and must not block saving the
// client's own fields. Failures are collected and surfaced to the caller
// instead of being silently swallowed, so a suspend that didn't actually
// take effect is visible in the panel rather than just showing "SUSPENDED"
// with no real effect.
async function syncClientInfrastructure(client: any): Promise<string[]> {
  const warnings: string[] = [];
  const suspended = client.status === 'SUSPENDED';

  try {
    await hostingService.applyCaddyConfig(client.domain, client.doc_root, suspended);
  } catch (err) {
    const msg = `No se pudo sincronizar el sitio web (Caddy) para ${client.domain}: ${(err as Error).message}`;
    console.error(`[CLIENT SERVICE] ${msg}`);
    warnings.push(msg);
  }

  try {
    const exists = await mailcowService.domainExists(client.domain);
    if (exists) {
      await mailcowService.setDomainActive(client.domain, !suspended);
    }
  } catch (err) {
    const msg = `No se pudo sincronizar el correo (Mailcow) para ${client.domain}: ${(err as Error).message}`;
    console.error(`[CLIENT SERVICE] ${msg}`);
    warnings.push(msg);
  }

  return warnings;
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
    const docRoot = data.doc_root || `${config.infrastructure.clientSitesPath}/${sanitizedDomain}/public_html`;
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
    const syncWarnings = await syncClientInfrastructure(createdClient);

    return { ...createdClient, _syncWarnings: syncWarnings };
  },

  async updateClient(id: string, data: Partial<ClientData>) {
    const fields: string[] = [];
    const params: any[] = [id];

    // id/created_at/updated_at are never client-editable; updated_at is always
    // set to CURRENT_TIMESTAMP below, so letting it through here as well would
    // assign it twice and Postgres rejects that outright ("multiple
    // assignments to same column"). Frontend sends the full client record back
    // (including these) when editing, so this exclusion has to happen here.
    const nonEditableFields = new Set(['id', 'created_at', 'updated_at']);

    Object.keys(data).forEach((key) => {
      if (!nonEditableFields.has(key) && data[key as keyof ClientData] !== undefined) {
        params.push(data[key as keyof ClientData]);
        fields.push(`${key} = $${params.length}`);
      }
    });

    if (fields.length === 0) return this.getClientById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    const sql = `UPDATE clients SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const res = await query(sql, params);
    
    if (res.rows.length === 0) return res.rows[0];

    const client = res.rows[0];
    const syncWarnings = await syncClientInfrastructure(client);

    return { ...client, _syncWarnings: syncWarnings };
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
    // Re-apply Caddy config and re-enable the mail domain to reactivate the
    // client's live website and email now that status is back to ACTIVE.
    const syncWarnings = await syncClientInfrastructure(updatedClient);

    return { ...updatedClient, _syncWarnings: syncWarnings };
  },

  async deleteClient(id: string) {
    const client = await this.getClientById(id);
    if (!client) return false;

    await query('DELETE FROM clients WHERE id = $1', [id]);
    return true;
  }
};
