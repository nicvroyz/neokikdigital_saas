import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/db';
import { mailcowService } from '../services/mailcowService';
import { webmailSsoService } from '../services/webmailSsoService';

const DOMAIN_REGEX = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bytesToMb(bytes: number | string | undefined | null): number {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : (bytes || 0);
  if (!n || Number.isNaN(n)) return 0;
  return Math.round((n / (1024 * 1024)) * 100) / 100;
}

function isEmailOfDomain(email: string, domain: string): boolean {
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

type ResourceEntity = 'mailbox' | 'domain' | 'alias';

async function insertResourceAuditLog(
  req: AuthRequest,
  action: string,
  entity: ResourceEntity,
  clientId: string,
  target: string,
  metadata: Record<string, any>,
  status: 'SUCCESS' | 'FAILED'
) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, client_id, action, entity, old_value, new_value, metadata, status, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.user?.id || null,
        clientId,
        action,
        entity,
        JSON.stringify({}),
        JSON.stringify({}),
        JSON.stringify({ target, ...metadata }),
        status,
        req.ip || null,
      ]
    );
  } catch (err) {
    console.error(`[AUDIT LOG ERROR] Failed to write ${entity} audit log`, err);
  }
}

async function getClientOr404(id: string, res: Response) {
  const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
  if (client.rows.length === 0) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return null;
  }
  return client.rows[0];
}

export const clientResourcesController = {
  // ==================== EMAILS (Mailcow mailboxes) ====================

  async getClientEmails(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const client = await getClientOr404(id, res);
      if (!client) return;

      const domain = client.domain;
      const mailboxes = await mailcowService.listMailboxes(domain);

      if (!Array.isArray(mailboxes)) {
        return res.json({ domain, emails: [] });
      }

      // Defensive: only keep mailboxes whose address actually belongs to this
      // client's domain, in case the Mailcow endpoint ever returns more than
      // the requested domain (same precaution already applied to listAliases).
      const domainMailboxes = mailboxes.filter((mb: any) => isEmailOfDomain(String(mb.username || ''), domain));

      const emails = domainMailboxes.map((mb: any) => ({
        address: mb.username,
        quota_mb: bytesToMb(mb.quota),
        used_mb: bytesToMb(mb.quota_used),
        status: Number(mb.active) === 1 ? 'ACTIVE' : 'INACTIVE',
        messages: mb.messages ?? null,
        last_imap_login: mb.last_imap_login || null,
        last_smtp_login: mb.last_smtp_login || null,
      }));

      return res.json({ domain, emails });
    } catch (err) {
      console.error('Error fetching client emails:', err);
      return res.status(502).json({ error: `Error al obtener las cuentas de correo desde Mailcow: ${(err as Error).message}` });
    }
  },

  async createEmailAccount(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { local_part, domain, password, quota, name } = req.body;
    try {
      if (!local_part || !domain || !password) {
        return res.status(400).json({ error: 'Campos requeridos: local_part, domain, password' });
      }
      if (!DOMAIN_REGEX.test(domain)) {
        return res.status(400).json({ error: 'Dominio inválido' });
      }

      const client = await getClientOr404(id, res);
      if (!client) return;
      if (domain.toLowerCase() !== String(client.domain).toLowerCase()) {
        return res.status(403).json({ error: 'El dominio no pertenece a este cliente' });
      }

      const domainExists = await mailcowService.domainExists(domain);
      if (!domainExists) {
        return res.status(400).json({ error: `El dominio ${domain} no está registrado en Mailcow. Debe crearse primero antes de agregar buzones.` });
      }

      const emailAddress = `${local_part}@${domain}`;
      const result = await mailcowService.createMailbox({
        local_part,
        domain,
        password,
        quota: quota || 1024,
        name,
      });

      await insertResourceAuditLog(req, 'email:create', 'mailbox', id, emailAddress, { quota_mb: quota || 1024 }, 'SUCCESS');

      return res.status(201).json({
        message: `Cuenta de correo creada: ${emailAddress}`,
        email: emailAddress,
        quota_mb: quota || 1024,
        status: 'ACTIVE',
        mailcow: result,
      });
    } catch (err) {
      console.error('Error creating email account:', err);
      await insertResourceAuditLog(req, 'email:create', 'mailbox', id, `${local_part}@${domain}`, { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al crear la cuenta de correo en Mailcow: ${(err as Error).message}` });
    }
  },

  async deleteEmailAccount(req: AuthRequest, res: Response) {
    const { id, address } = req.params;
    const email = decodeURIComponent(address);
    try {
      const client = await getClientOr404(id, res);
      if (!client) return;

      if (!isEmailOfDomain(email, client.domain)) {
        return res.status(403).json({ error: 'La casilla no pertenece a este cliente' });
      }

      await mailcowService.deleteMailbox(email);
      await insertResourceAuditLog(req, 'email:delete', 'mailbox', id, email, {}, 'SUCCESS');
      return res.json({ message: `Cuenta de correo eliminada: ${email}` });
    } catch (err) {
      console.error('Error deleting email account:', err);
      await insertResourceAuditLog(req, 'email:delete', 'mailbox', id, email, { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al eliminar la cuenta de correo en Mailcow: ${(err as Error).message}` });
    }
  },

  // Password/quota/active changes are all routed through mailcowService.updateMailbox(),
  // which maps to Mailcow's single /edit/mailbox endpoint ({ items: [email], attr: {...} }).
  // There is intentionally no separate changePassword()/changeQuota() service method.
  async updateEmailAccount(req: AuthRequest, res: Response) {
    const { id, address } = req.params;
    const { password, quota, active } = req.body;
    const email = decodeURIComponent(address);
    try {
      const client = await getClientOr404(id, res);
      if (!client) return;

      if (!isEmailOfDomain(email, client.domain)) {
        return res.status(403).json({ error: 'La casilla no pertenece a este cliente' });
      }
      if (password === undefined && quota === undefined && active === undefined) {
        return res.status(400).json({ error: 'Debes enviar password, quota o active para actualizar' });
      }
      if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }

      const result = await mailcowService.updateMailbox(email, { password, quota, active });

      // Never persist the plaintext password in audit metadata — just record that it changed.
      const action = password !== undefined ? 'email:update_password' : quota !== undefined ? 'email:update_quota' : 'email:update';
      const metadata: Record<string, any> = {};
      if (password !== undefined) metadata.password_changed = true;
      if (quota !== undefined) metadata.quota_mb = quota;
      if (active !== undefined) metadata.active = active;
      await insertResourceAuditLog(req, action, 'mailbox', id, email, metadata, 'SUCCESS');

      return res.json({ message: `Cuenta de correo actualizada: ${email}`, mailcow: result });
    } catch (err) {
      console.error('Error updating email account:', err);
      await insertResourceAuditLog(req, 'email:update', 'mailbox', id, email, { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al actualizar la cuenta de correo en Mailcow: ${(err as Error).message}` });
    }
  },

  // ==================== WEBMAIL SSO ====================
  // See infra/mailcow/sogo-auth.php and docs/WEBMAIL_SSO.md — the token is redeemed
  // exactly once, within 60s, by a small bridge deployed on the Mailcow host itself.
  // Neokik never sees or stores a mailbox password to make this work.

  async createWebmailToken(req: AuthRequest, res: Response) {
    const { id, address } = req.params;
    const email = decodeURIComponent(address);
    try {
      if (!webmailSsoService.isConfigured()) {
        return res.status(503).json({ error: 'El acceso directo a Webmail no está configurado (falta WEBMAIL_SSO_SECRET en el servidor).' });
      }

      const client = await getClientOr404(id, res);
      if (!client) return;

      if (!isEmailOfDomain(email, client.domain)) {
        return res.status(403).json({ error: 'La casilla no pertenece a este cliente' });
      }

      const mailboxes = await mailcowService.listMailboxes(client.domain);
      const mailboxExists = Array.isArray(mailboxes) && mailboxes.some((mb: any) => String(mb.username).toLowerCase() === email.toLowerCase());
      if (!mailboxExists) {
        return res.status(404).json({ error: 'La casilla no existe en Mailcow' });
      }

      const { url } = webmailSsoService.generateToken(email, id, req.user?.id);
      await insertResourceAuditLog(req, 'email:webmail_access', 'mailbox', id, email, {}, 'SUCCESS');

      return res.json({ url });
    } catch (err) {
      console.error('Error generating webmail SSO token:', err);
      await insertResourceAuditLog(req, 'email:webmail_access', 'mailbox', id, email, { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al generar el acceso a Webmail: ${(err as Error).message}` });
    }
  },

  // ==================== DOMAINS ====================
  // Today a client has exactly one domain (clients.domain). The response is shaped
  // as a list on purpose so a future move to multiple domains per client only needs
  // a new table + query here — the frontend contract (an array) doesn't have to change.

  async getClientDomains(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const client = await getClientOr404(id, res);
      if (!client) return;

      const exists = await mailcowService.domainExists(client.domain);
      return res.json({
        domains: [
          {
            domain: client.domain,
            is_primary: true,
            mailcow_status: exists ? 'PROVISIONED' : 'NOT_PROVISIONED',
          },
        ],
      });
    } catch (err) {
      console.error('Error fetching client domains:', err);
      return res.status(502).json({ error: `Error al consultar dominios en Mailcow: ${(err as Error).message}` });
    }
  },

  async createClientDomain(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { domain } = req.body;
    try {
      const client = await getClientOr404(id, res);
      if (!client) return;

      const targetDomain = domain || client.domain;
      if (String(targetDomain).toLowerCase() !== String(client.domain).toLowerCase()) {
        return res.status(400).json({ error: 'Por ahora solo se admite el dominio principal del cliente' });
      }

      const alreadyExists = await mailcowService.domainExists(client.domain);
      if (alreadyExists) {
        return res.status(409).json({ error: `El dominio ${client.domain} ya está registrado en Mailcow` });
      }

      const result = await mailcowService.createDomain(client.domain);
      await insertResourceAuditLog(req, 'domain:create', 'domain', id, client.domain, {}, 'SUCCESS');
      return res.status(201).json({ message: `Dominio ${client.domain} creado en Mailcow`, mailcow: result });
    } catch (err) {
      console.error('Error creating client domain:', err);
      await insertResourceAuditLog(req, 'domain:create', 'domain', id, domain || '', { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al crear el dominio en Mailcow: ${(err as Error).message}` });
    }
  },

  async deleteClientDomain(req: AuthRequest, res: Response) {
    const { id, domain } = req.params;
    const targetDomain = decodeURIComponent(domain);
    try {
      const client = await getClientOr404(id, res);
      if (!client) return;

      if (targetDomain.toLowerCase() !== String(client.domain).toLowerCase()) {
        return res.status(403).json({ error: 'El dominio no pertenece a este cliente' });
      }

      await mailcowService.deleteDomain(targetDomain);
      await insertResourceAuditLog(req, 'domain:delete', 'domain', id, targetDomain, {}, 'SUCCESS');
      return res.json({ message: `Dominio ${targetDomain} eliminado de Mailcow (incluye todos sus buzones y alias)` });
    } catch (err) {
      console.error('Error deleting client domain:', err);
      await insertResourceAuditLog(req, 'domain:delete', 'domain', id, targetDomain, { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al eliminar el dominio en Mailcow: ${(err as Error).message}` });
    }
  },

  // ==================== ALIASES ====================

  async getClientAliases(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const client = await getClientOr404(id, res);
      if (!client) return;

      const aliases = await mailcowService.listAliases(client.domain);
      return res.json({
        domain: client.domain,
        aliases: (aliases || []).map((a: any) => ({
          address: a.address,
          goto: a.goto,
          active: Number(a.active) === 1,
        })),
      });
    } catch (err) {
      console.error('Error fetching client aliases:', err);
      return res.status(502).json({ error: `Error al obtener alias desde Mailcow: ${(err as Error).message}` });
    }
  },

  async createClientAlias(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { local_part, goto } = req.body;
    try {
      const client = await getClientOr404(id, res);
      if (!client) return;

      if (!local_part || !goto) {
        return res.status(400).json({ error: 'Campos requeridos: local_part, goto' });
      }
      if (!EMAIL_REGEX.test(goto)) {
        return res.status(400).json({ error: 'El destino (goto) debe ser un correo válido' });
      }

      const address = `${local_part}@${client.domain}`;
      const result = await mailcowService.createAlias(address, goto);
      await insertResourceAuditLog(req, 'alias:create', 'alias', id, address, { goto }, 'SUCCESS');
      return res.status(201).json({ message: `Alias creado: ${address} → ${goto}`, address, goto, mailcow: result });
    } catch (err) {
      console.error('Error creating client alias:', err);
      await insertResourceAuditLog(req, 'alias:create', 'alias', id, `${local_part}@${req.body?.domain || ''}`, { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al crear el alias en Mailcow: ${(err as Error).message}` });
    }
  },

  async deleteClientAlias(req: AuthRequest, res: Response) {
    const { id, address } = req.params;
    const aliasAddress = decodeURIComponent(address);
    try {
      const client = await getClientOr404(id, res);
      if (!client) return;

      if (!isEmailOfDomain(aliasAddress, client.domain)) {
        return res.status(403).json({ error: 'El alias no pertenece a este cliente' });
      }

      await mailcowService.deleteAlias(aliasAddress);
      await insertResourceAuditLog(req, 'alias:delete', 'alias', id, aliasAddress, {}, 'SUCCESS');
      return res.json({ message: `Alias eliminado: ${aliasAddress}` });
    } catch (err) {
      console.error('Error deleting client alias:', err);
      await insertResourceAuditLog(req, 'alias:delete', 'alias', id, aliasAddress, { error: (err as Error).message }, 'FAILED');
      return res.status(502).json({ error: `Error al eliminar el alias en Mailcow: ${(err as Error).message}` });
    }
  },
};
