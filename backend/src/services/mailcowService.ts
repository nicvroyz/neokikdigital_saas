import { config } from '../config/env';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDryRun(): boolean {
  return !!config.caddy.dryRun;
}

function log(message: string): void {
  console.log(`[MAILCOW] ${message}`);
}

function logError(message: string, err?: any): void {
  console.error(`[MAILCOW ERROR] ${message}`, err || '');
}

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.mailcow.apiKey,
  };
}

function apiUrl(endpoint: string): string {
  const base = config.mailcow.apiUrl.replace(/\/$/, '');
  return `${base}/api/v1${endpoint}`;
}

async function apiRequest(method: string, endpoint: string, body?: any): Promise<any> {
  const url = apiUrl(endpoint);
  log(`${method} ${url}`);

  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      logError(`API respondió con status ${response.status}: ${JSON.stringify(data)}`);
      throw new Error(`Mailcow API error ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }

    return data;
  } catch (err) {
    if ((err as Error).message?.includes('Mailcow API error')) {
      throw err;
    }
    logError(`Error de conexión con Mailcow API`, err);
    throw new Error(`Error de conexión con Mailcow: ${(err as Error).message}`);
  }
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const mockMailboxes: Record<string, any[]> = {
  'clienteejemplo.cl': [
    {
      username: 'contacto@clienteejemplo.cl',
      name: 'Contacto',
      active: 1,
      domain: 'clienteejemplo.cl',
      local_part: 'contacto',
      quota: 524288000,
      quota_used: 198180864,
      messages: 1247,
      last_imap_login: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    },
    {
      username: 'ventas@clienteejemplo.cl',
      name: 'Ventas',
      active: 1,
      domain: 'clienteejemplo.cl',
      local_part: 'ventas',
      quota: 524288000,
      quota_used: 163577856,
      messages: 834,
      last_imap_login: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    },
    {
      username: 'gerencia@clienteejemplo.cl',
      name: 'Gerencia',
      active: 1,
      domain: 'clienteejemplo.cl',
      local_part: 'gerencia',
      quota: 1073741824,
      quota_used: 432013312,
      messages: 2103,
      last_imap_login: new Date(Date.now() - 0.5 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    },
  ],
  'jacvroyz.cl': [
    {
      username: 'admin@jacvroyz.cl',
      name: 'Admin Neokik',
      active: 1,
      domain: 'jacvroyz.cl',
      local_part: 'admin',
      quota: 2147483648,
      quota_used: 524288000,
      messages: 4521,
      last_imap_login: new Date(Date.now() - 0.2 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 0.5 * 3600 * 1000).toISOString(),
    },
    {
      username: 'soporte@jacvroyz.cl',
      name: 'Soporte Neokik',
      active: 1,
      domain: 'jacvroyz.cl',
      local_part: 'soporte',
      quota: 1073741824,
      quota_used: 312475648,
      messages: 1876,
      last_imap_login: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
  ],
  'papelesconcepcion.cl': [
    {
      username: 'contacto@papelesconcepcion.cl',
      name: 'Contacto Papeles',
      active: 1,
      domain: 'papelesconcepcion.cl',
      local_part: 'contacto',
      quota: 524288000,
      quota_used: 89128960,
      messages: 523,
      last_imap_login: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    },
    {
      username: 'ventas@papelesconcepcion.cl',
      name: 'Ventas Papeles',
      active: 1,
      domain: 'papelesconcepcion.cl',
      local_part: 'ventas',
      quota: 524288000,
      quota_used: 156237824,
      messages: 891,
      last_imap_login: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    },
    {
      username: 'gerencia@papelesconcepcion.cl',
      name: 'Gerencia Papeles',
      active: 1,
      domain: 'papelesconcepcion.cl',
      local_part: 'gerencia',
      quota: 1073741824,
      quota_used: 267386880,
      messages: 1234,
      last_imap_login: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      last_smtp_login: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
  ],
};

const mockDomains = ['jacvroyz.cl', 'papelesconcepcion.cl'];

// ─── Service ─────────────────────────────────────────────────────────────────

export const mailcowService = {
  async createDomain(domain: string): Promise<any> {
    log(`Creando dominio: ${domain}`);

    if (isDryRun()) {
      log(`[DRY RUN] Dominio creado: ${domain}`);
      mockDomains.push(domain);
      mockMailboxes[domain] = [];
      return { type: 'success', msg: `Dominio ${domain} creado exitosamente (simulado)` };
    }

    return apiRequest('POST', '/add/domain', {
      domain,
      description: `Dominio gestionado por Neokik Digital`,
      aliases: 400,
      mailboxes: 50,
      defquota: 512,
      maxquota: 2048,
      restart_sogo: 1,
      active: 1,
    });
  },

  async deleteDomain(domain: string): Promise<any> {
    log(`Eliminando dominio: ${domain}`);

    if (isDryRun()) {
      log(`[DRY RUN] Dominio eliminado: ${domain}`);
      const idx = mockDomains.indexOf(domain);
      if (idx !== -1) mockDomains.splice(idx, 1);
      delete mockMailboxes[domain];
      return { type: 'success', msg: `Dominio ${domain} eliminado (simulado)` };
    }

    return apiRequest('POST', '/delete/domain', [domain]);
  },

  async listMailboxes(domain: string): Promise<any[]> {
    log(`Listando casillas de: ${domain}`);

    if (isDryRun()) {
      log(`[DRY RUN] Retornando casillas simuladas de ${domain}`);
      return mockMailboxes[domain] || [];
    }

    return apiRequest('GET', `/get/mailbox/all/${domain}`);
  },

  async createMailbox(data: { local_part: string; domain: string; password: string; quota: number; name?: string }): Promise<any> {
    const email = `${data.local_part}@${data.domain}`;
    log(`Creando casilla: ${email}`);

    if (isDryRun()) {
      log(`[DRY RUN] Casilla creada: ${email}`);
      const newMailbox = {
        username: email,
        name: data.name || data.local_part,
        active: 1,
        domain: data.domain,
        local_part: data.local_part,
        quota: data.quota * 1024 * 1024,
        quota_used: 0,
        messages: 0,
        last_imap_login: null,
        last_smtp_login: null,
      };
      if (!mockMailboxes[data.domain]) mockMailboxes[data.domain] = [];
      mockMailboxes[data.domain].push(newMailbox);
      return { type: 'success', msg: `Casilla ${email} creada exitosamente (simulado)` };
    }

    return apiRequest('POST', '/add/mailbox', {
      local_part: data.local_part,
      domain: data.domain,
      name: data.name || data.local_part,
      password: data.password,
      password2: data.password,
      quota: data.quota,
      active: 1,
      force_pw_update: 0,
      tls_enforce_in: 0,
      tls_enforce_out: 0,
    });
  },

  async deleteMailbox(email: string): Promise<any> {
    log(`Eliminando casilla: ${email}`);

    if (isDryRun()) {
      log(`[DRY RUN] Casilla eliminada: ${email}`);
      const domain = email.split('@')[1];
      if (mockMailboxes[domain]) {
        mockMailboxes[domain] = mockMailboxes[domain].filter(m => m.username !== email);
      }
      return { type: 'success', msg: `Casilla ${email} eliminada (simulado)` };
    }

    return apiRequest('POST', '/delete/mailbox', [email]);
  },

  async updateMailbox(email: string, data: { password?: string; quota?: number; active?: boolean }): Promise<any> {
    log(`Actualizando casilla: ${email}`);

    if (isDryRun()) {
      log(`[DRY RUN] Casilla actualizada: ${email}`);
      const domain = email.split('@')[1];
      if (mockMailboxes[domain]) {
        const mb = mockMailboxes[domain].find(m => m.username === email);
        if (mb) {
          if (data.quota !== undefined) mb.quota = data.quota * 1024 * 1024;
          if (data.active !== undefined) mb.active = data.active ? 1 : 0;
        }
      }
      return { type: 'success', msg: `Casilla ${email} actualizada (simulado)` };
    }

    const updateData: any = {};
    if (data.password) {
      updateData.password = data.password;
      updateData.password2 = data.password;
    }
    if (data.quota !== undefined) updateData.quota = data.quota;
    if (data.active !== undefined) updateData.active = data.active ? 1 : 0;

    return apiRequest('POST', `/edit/mailbox`, {
      items: [email],
      attr: updateData,
    });
  },

  async getMailboxQuota(email: string): Promise<{ used: number; total: number }> {
    log(`Consultando cuota de: ${email}`);

    if (isDryRun()) {
      const domain = email.split('@')[1];
      const mb = mockMailboxes[domain]?.find(m => m.username === email);
      if (mb) {
        return { used: mb.quota_used, total: mb.quota };
      }
      return { used: 0, total: 524288000 };
    }

    const mailbox = await apiRequest('GET', `/get/mailbox/${email}`);
    return {
      used: mailbox.quota_used || 0,
      total: mailbox.quota || 0,
    };
  },

  async createAlias(address: string, goto: string): Promise<any> {
    log(`Creando alias: ${address} → ${goto}`);

    if (isDryRun()) {
      log(`[DRY RUN] Alias creado: ${address} → ${goto}`);
      return { type: 'success', msg: `Alias ${address} → ${goto} creado (simulado)` };
    }

    return apiRequest('POST', '/add/alias', {
      address,
      goto,
      active: 1,
    });
  },

  async deleteAlias(address: string): Promise<any> {
    log(`Eliminando alias: ${address}`);

    if (isDryRun()) {
      log(`[DRY RUN] Alias eliminado: ${address}`);
      return { type: 'success', msg: `Alias ${address} eliminado (simulado)` };
    }

    return apiRequest('POST', '/delete/alias', [address]);
  },

  async createForwarder(address: string, goto: string): Promise<any> {
    log(`Creando reenvío: ${address} → ${goto}`);

    if (isDryRun()) {
      log(`[DRY RUN] Reenvío creado: ${address} → ${goto}`);
      return { type: 'success', msg: `Reenvío ${address} → ${goto} creado (simulado)` };
    }

    return apiRequest('POST', '/add/alias', {
      address,
      goto,
      active: 1,
    });
  },

  async getStatus(): Promise<{ connected: boolean; version?: string; domains: number; mailboxes: number }> {
    log('Consultando estado de Mailcow...');

    if (isDryRun()) {
      const totalMailboxes = Object.values(mockMailboxes).reduce((acc, arr) => acc + arr.length, 0);
      return {
        connected: true,
        version: '2024-07 (Mailcow Dockerized)',
        domains: mockDomains.length,
        mailboxes: totalMailboxes,
      };
    }

    try {
      const domainsData = await apiRequest('GET', '/get/domain/all');
      const domains = Array.isArray(domainsData) ? domainsData.length : 0;

      let totalMailboxes = 0;
      if (Array.isArray(domainsData)) {
        for (const d of domainsData) {
          try {
            const mbs = await apiRequest('GET', `/get/mailbox/all/${d.domain_name}`);
            totalMailboxes += Array.isArray(mbs) ? mbs.length : 0;
          } catch { /* ignore */ }
        }
      }

      return {
        connected: true,
        version: 'Mailcow Dockerized',
        domains,
        mailboxes: totalMailboxes,
      };
    } catch (err) {
      logError('No se pudo conectar a Mailcow', err);
      return { connected: false, domains: 0, mailboxes: 0 };
    }
  },
};
