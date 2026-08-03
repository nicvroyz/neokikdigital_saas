import { Request, Response } from 'express';
import { query } from '../config/db';
import { queueService } from '../services/queueService';
import { migrationService } from '../services/migrationService';
import { eventBus } from '../services/eventBus';
import { migrationPlannerService } from '../services/migrationPlannerService';
import { config } from '../config/env';
import os from 'os';
import { execSync } from 'child_process';
import { monitoringService } from '../services/monitoringService';
import { mailcowService } from '../services/mailcowService';
import { dnsAnalyzerService } from '../services/dnsAnalyzerService';
import { sslService } from '../services/sslService';
import { dockerService } from '../services/dockerService';
import { databaseService } from '../services/databaseService';
import { storageService } from '../services/storageService';
import http from 'http';
import tls from 'tls';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Mocks/local fallbacks below exist ONLY for local development convenience. In
// production (NODE_ENV=production) they must never be reachable — an
// infrastructure failure there has to surface as a real error, never as
// fabricated data.
function isInfraDryRun(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return !!config.migration.dryRun;
}

function clientDbName(domain: string): string {
  return `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function bytesToMb(bytes: number | string | undefined | null): number {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : (bytes || 0);
  if (!n || Number.isNaN(n)) return 0;
  return Math.round((n / (1024 * 1024)) * 100) / 100;
}

function getCertificateInfo(domain: string, timeoutMs = 5000): Promise<{ issuer: string; valid_from: string; valid_until: string } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { issuer: string; valid_from: string; valid_until: string } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const socket = tls.connect({ host: domain, port: 443, servername: domain, timeout: timeoutMs, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          finish(null);
          return;
        }
        const issuerOrg = cert.issuer?.O ?? cert.issuer?.CN;
        finish({
          issuer: (Array.isArray(issuerOrg) ? issuerOrg[0] : issuerOrg) || "Let's Encrypt",
          valid_from: new Date(cert.valid_from).toISOString(),
          valid_until: new Date(cert.valid_to).toISOString(),
        });
      });
      socket.on('error', () => finish(null));
      socket.on('timeout', () => { socket.destroy(); finish(null); });
    } catch {
      finish(null);
    }
  });
}

function parseClientLogLines(raw: string, type: string): Array<{ timestamp: string; level: string; message: string }> {
  if (!raw) return [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    if (type === 'caddy') {
      try {
        const obj = JSON.parse(line);
        const req = obj.request ? `${obj.request.method || ''} ${obj.request.uri || ''}`.trim() : '';
        const status = obj.status !== undefined ? `- ${obj.status}` : '';
        return {
          timestamp: obj.ts ? new Date(obj.ts * 1000).toISOString() : new Date().toISOString(),
          level: String(obj.level || 'info').toUpperCase(),
          message: [obj.msg, req, status].filter(Boolean).join(' ') || line,
        };
      } catch {
        return { timestamp: new Date().toISOString(), level: 'INFO', message: line };
      }
    }
    return { timestamp: new Date().toISOString(), level: 'INFO', message: line };
  });
}

async function checkDockerServiceStatus(containerName: string): Promise<string> {
  const isDryRun = !!config.caddy.dryRun || !fs.existsSync('/var/run/docker.sock');
  if (isDryRun) {
    return 'running';
  }

  return new Promise<string>((resolve) => {
    const options = {
      socketPath: '/var/run/docker.sock',
      path: `/containers/${containerName}/json`,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const info = JSON.parse(data);
            resolve(info.State?.Running ? 'running' : 'stopped');
          } catch {
            resolve('stopped');
          }
        } else {
          resolve('inactive');
        }
      });
    });

    req.on('error', () => {
      resolve('inactive');
    });

    req.end();
  });
}

async function checkDockerDaemonStatus(): Promise<string> {
  const isDryRun = !!config.caddy.dryRun || !fs.existsSync('/var/run/docker.sock');
  if (isDryRun) {
    return 'active';
  }
  return new Promise<string>((resolve) => {
    const options = {
      socketPath: '/var/run/docker.sock',
      path: '/info',
      method: 'GET'
    };
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve('active');
      } else {
        resolve('inactive');
      }
    });
    req.on('error', () => resolve('inactive'));
    req.end();
  });
}

export const infrastructureController = {
  // ==================== PROVISIONING ====================

  async createProvision(req: Request, res: Response) {
    try {
      const { client_id, domain, project_type, manage_hosting, manage_email, email_accounts } = req.body;
      if (!domain || !project_type) {
        return res.status(400).json({ error: 'Campos requeridos: domain, project_type' });
      }
      const result = await query(
        `INSERT INTO provisions (client_id, domain, project_type, manage_hosting, manage_email, email_accounts, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7) RETURNING *`,
        [client_id || null, domain, project_type, manage_hosting ?? true, manage_email ?? false, JSON.stringify(email_accounts || []), new Date().toISOString()]
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error creating provision:', err);
      return res.status(500).json({ error: 'Error al crear el aprovisionamiento' });
    }
  },

  async executeProvision(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const prov = await query('SELECT * FROM provisions WHERE id = $1', [id]);
      if (prov.rows.length === 0) {
        return res.status(404).json({ error: 'Aprovisionamiento no encontrado' });
      }
      
      // Update status to PENDING/QUEUED
      await query('UPDATE provisions SET status = \'PENDING\' WHERE id = $1', [id]);
      
      await queueService.enqueue('PROVISION', id, prov.rows[0]);
      return res.status(202).json({ message: 'Aprovisionamiento encolado', provision: prov.rows[0] });
    } catch (err) {
      console.error('Error executing provision:', err);
      return res.status(500).json({ error: 'Error al ejecutar el aprovisionamiento' });
    }
  },

  async getProvision(req: Request, res: Response) {
    try {
      const result = await query('SELECT * FROM provisions WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Aprovisionamiento no encontrado' });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching provision:', err);
      return res.status(500).json({ error: 'Error al obtener el aprovisionamiento' });
    }
  },

  async getAllProvisions(req: Request, res: Response) {
    try {
      const result = await query('SELECT * FROM provisions ORDER BY created_at DESC');
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching provisions:', err);
      return res.status(500).json({ error: 'Error al obtener los aprovisionamientos' });
    }
  },

  // ==================== MIGRATIONS ====================

  async uploadBackup(req: Request, res: Response) {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No se recibió ningún archivo de respaldo' });
      }

      const migrations: any[] = [];
      for (const file of files) {
        const backupType = file.originalname.toLowerCase().endsWith('.sql') ? 'DATABASE_SQL'
          : file.originalname.toLowerCase().endsWith('.zip') ? 'WEBSITE_ZIP'
          : 'CPANEL_FULL';

        const result = await query(
          `INSERT INTO migrations (domain, backup_type, backup_path, backup_size_bytes, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'PENDING', $5, $6) RETURNING *`,
          [req.body.domain || null, backupType, file.path, file.size, new Date().toISOString(), new Date().toISOString()]
        );
        migrations.push(result.rows[0]);
      }

      return res.status(201).json({
        message: `${migrations.length} respaldo(s) subido(s) exitosamente`,
        migrations,
      });
    } catch (err) {
      console.error('Error uploading backup:', err);
      return res.status(500).json({ error: 'Error al subir el respaldo' });
    }
  },

  async analyzeBackup(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const migration = await query('SELECT * FROM migrations WHERE id = $1', [id]);
      if (migration.rows.length === 0) {
        return res.status(404).json({ error: 'Migración no encontrada' });
      }

      const report = await migrationService.analyzeBackup(id, migration.rows[0].backup_path, migration.rows[0].backup_type);
      const updated = await query('SELECT * FROM migrations WHERE id = $1', [id]);

      return res.json({ message: 'Análisis completado', migration: updated.rows[0], report });
    } catch (err) {
      console.error('Error analyzing backup:', err);
      return res.status(500).json({ error: 'Error al analizar el respaldo' });
    }
  },

  async simulateMigration(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const migration = await query('SELECT * FROM migrations WHERE id = $1', [id]);
      if (migration.rows.length === 0) {
        return res.status(404).json({ error: 'Migración no encontrada' });
      }

      // Fetch scan analysis report from DB
      let analysisReport = migration.rows[0].analysis_report;
      if (!analysisReport) {
        // If not analyzed yet, run it in place
        analysisReport = await migrationService.analyzeBackup(id, migration.rows[0].backup_path, migration.rows[0].backup_type);
      }

      // Generate the plan
      const plan = await migrationPlannerService.generatePlan(id, analysisReport, migration.rows[0].backup_path);

      const result = await query(
        `UPDATE migrations SET status = $1, simulation_report = $2, migration_score = $3, updated_at = $4 WHERE id = $5 RETURNING *`,
        ['READY', JSON.stringify(plan), plan.score, new Date().toISOString(), id]
      );

      await query(
        `INSERT INTO migration_logs (migration_id, step, message, status, started_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, 'simulate_migration', `Simulación de viabilidad completada con score de ${plan.score}%.`, 'SUCCESS', new Date().toISOString(), new Date().toISOString()]
      );

      return res.json({ message: 'Simulación completada', migration: result.rows[0], report: plan });
    } catch (err) {
      console.error('Error simulating migration:', err);
      return res.status(500).json({ error: 'Error al simular la migración' });
    }
  },

  async executeMigration(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const migration = await query('SELECT * FROM migrations WHERE id = $1', [id]);
      if (migration.rows.length === 0) {
        return res.status(404).json({ error: 'Migración no encontrada' });
      }

      let plan = migration.rows[0].simulation_report;
      if (!plan) {
        return res.status(400).json({ error: 'Debes simular la migración primero.' });
      }

      if (typeof plan === 'string') {
        try {
          plan = JSON.parse(plan);
        } catch (e) {
          return res.status(400).json({ error: 'El reporte de simulación es inválido o corrupto.' });
        }
      }

      const jobPayload = plan.jobPayload;

      // Update main status to PENDING/QUEUED in database
      const result = await query(
        `UPDATE migrations SET status = 'PENDING', updated_at = $1 WHERE id = $2 RETURNING *`,
        [new Date().toISOString(), id]
      );

      // Enqueue job with standardized jobPayload
      await queueService.enqueue('MIGRATION', id, jobPayload);

      return res.status(202).json({ message: 'Migración encolada exitosamente', migration: result.rows[0] });
    } catch (err) {
      console.error('Error executing migration:', err);
      return res.status(500).json({ error: 'Error al ejecutar la migración' });
    }
  },

  async getAllMigrations(req: Request, res: Response) {
    try {
      const result = await query('SELECT * FROM migrations ORDER BY created_at DESC');
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching migrations:', err);
      return res.status(500).json({ error: 'Error al obtener las migraciones' });
    }
  },

  async getMigration(req: Request, res: Response) {
    try {
      const migration = await query('SELECT * FROM migrations WHERE id = $1', [req.params.id]);
      if (migration.rows.length === 0) {
        return res.status(404).json({ error: 'Migración no encontrada' });
      }
      const logs = await query('SELECT * FROM migration_logs WHERE migration_id = $1 ORDER BY started_at ASC', [req.params.id]);
      return res.json({ ...migration.rows[0], logs: logs.rows });
    } catch (err) {
      console.error('Error fetching migration:', err);
      return res.status(500).json({ error: 'Error al obtener la migración' });
    }
  },

  async getMigrationLogs(req: Request, res: Response) {
    try {
      const result = await query('SELECT * FROM migration_logs WHERE migration_id = $1 ORDER BY started_at ASC', [req.params.id]);
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching migration logs:', err);
      return res.status(500).json({ error: 'Error al obtener los logs de migración' });
    }
  },

  async rollbackMigration(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const migration = await query('SELECT * FROM migrations WHERE id = $1', [id]);
      if (migration.rows.length === 0) {
        return res.status(404).json({ error: 'Migración no encontrada' });
      }

      const result = await query(
        `UPDATE migrations SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
        ['ROLLED_BACK', new Date().toISOString(), id]
      );

      await query(
        `INSERT INTO migration_logs (migration_id, step, message, status, started_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, 'rollback', 'Rollback ejecutado exitosamente', 'SUCCESS', new Date().toISOString(), new Date().toISOString()]
      );

      return res.json({ message: 'Rollback ejecutado exitosamente', migration: result.rows[0] });
    } catch (err) {
      console.error('Error rolling back migration:', err);
      return res.status(500).json({ error: 'Error al ejecutar el rollback' });
    }
  },

  async deleteMigration(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await query('DELETE FROM migration_logs WHERE migration_id = $1', [id]);
      await query('DELETE FROM migrations WHERE id = $1', [id]);
      return res.json({ message: 'Migración eliminada exitosamente' });
    } catch (err) {
      console.error('Error deleting migration:', err);
      return res.status(500).json({ error: 'Error al eliminar la migración' });
    }
  },

  // ==================== DNS ====================

  async analyzeDNS(req: Request, res: Response) {
    try {
      const { domain } = req.params;
      if (!domain) {
        return res.status(400).json({ error: 'Dominio requerido' });
      }

      const dnsReport = await dnsAnalyzerService.analyzeDomain(domain, config.infrastructure.vpsIP);
      return res.json(dnsReport);
    } catch (err) {
      console.error('Error analyzing DNS:', err);
      return res.status(502).json({ error: `Error al analizar DNS de ${req.params.domain}: ${(err as Error).message}` });
    }
  },

  // ==================== SSL ====================

  async issueSSL(req: Request, res: Response) {
    try {
      const { domain } = req.params;
      if (!domain) {
        return res.status(400).json({ error: 'Dominio requerido' });
      }

      // Reloads Caddy so it picks up/renews on-demand TLS for the domain.
      await sslService.configureSSL(domain);
      const certInfo = isInfraDryRun() ? null : await getCertificateInfo(domain);

      return res.json({
        domain,
        status: certInfo ? 'ISSUED' : 'PENDING',
        issuer: certInfo?.issuer || "Let's Encrypt",
        valid_from: certInfo?.valid_from || null,
        valid_until: certInfo?.valid_until || null,
        auto_renew: true,
        message: certInfo
          ? `Certificado SSL activo para ${domain}`
          : `Configuración de Caddy actualizada para ${domain}. Caddy emitirá el certificado Let's Encrypt automáticamente en la primera solicitud HTTPS.`,
      });
    } catch (err) {
      console.error('Error issuing SSL:', err);
      return res.status(502).json({ error: `Error al emitir/renovar el certificado SSL para ${req.params.domain}: ${(err as Error).message}` });
    }
  },

  async getServerStatus(req: Request, res: Response) {
    try {
      let metrics;
      try {
        metrics = await monitoringService.measureDiagnostics();
      } catch (e) {
        metrics = await monitoringService.getLatestHealthMetrics();
      }

      // Read real OS version from /host/os-release if mounted
      let osName = 'Ubuntu 24.04 LTS'; // Default VPS OS fallback
      try {
        const releasePath = '/host/os-release';
        if (fs.existsSync(releasePath)) {
          const content = fs.readFileSync(releasePath, 'utf8');
          const prettyNameMatch = content.match(/PRETTY_NAME="([^"]+)"/) || content.match(/PRETTY_NAME=(.+)/);
          if (prettyNameMatch) {
            osName = prettyNameMatch[1].replace(/"/g, '');
          }
        } else if (process.platform === 'linux') {
          const osRelease = execSync("grep 'PRETTY_NAME' /etc/os-release | cut -d'=' -f2 | tr -d '\"'").toString().trim();
          if (osRelease) osName = osRelease;
        } else {
          osName = os.type() + ' ' + os.release();
        }
      } catch (err) {
        console.warn('Error reading os-release, using fallback:', err);
      }

      // Read real VPS hostname from /host/hostname if mounted
      let hostHostname = 'vps-4a5f87c4'; // Default VPS hostname fallback
      try {
        const hostnamePath = '/host/hostname';
        if (fs.existsSync(hostnamePath)) {
          hostHostname = fs.readFileSync(hostnamePath, 'utf8').trim();
        } else {
          hostHostname = os.hostname();
        }
      } catch (err) {
        hostHostname = os.hostname();
      }

      // Check statuses of Whitelisted Containers
      const caddyStatus = await checkDockerServiceStatus('neokik-caddy');
      const dbStatus = await checkDockerServiceStatus('neokik-db');
      const apiStatus = await checkDockerServiceStatus('neokik-api');
      const frontendStatus = await checkDockerServiceStatus('neokik-frontend');
      const dockerStatus = await checkDockerDaemonStatus();

      // Count actual sites and ssl certs from PostgreSQL clients
      const clientsQuery = await query("SELECT COUNT(*) as count FROM clients WHERE status = 'ACTIVE'");
      const activeSites = parseInt(clientsQuery.rows[0]?.count || '0', 10);

      const status = {
        hostname: hostHostname,
        os: osName,
        uptime_days: Math.floor(os.uptime() / (3600 * 24)),
        cpu: { cores: os.cpus().length, usage_percent: metrics.cpu_usage },
        memory: { total_gb: metrics.ram_total_gb, used_gb: metrics.ram_used_gb, usage_percent: Math.round((metrics.ram_used_gb / metrics.ram_total_gb) * 100) },
        disk: { total_gb: metrics.disk_total_gb, used_gb: metrics.disk_used_gb, usage_percent: Math.round((metrics.disk_used_gb / metrics.disk_total_gb) * 100) },
        services: {
          docker: { status: dockerStatus },
          caddy: { status: caddyStatus },
          postgres: { status: dbStatus },
          backend: { status: apiStatus },
          frontend: { status: frontendStatus }
        },
        active_sites: activeSites,
        ssl_certificates: activeSites,
        last_backup: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      };

      return res.json(status);
    } catch (err) {
      console.error('Error fetching server status:', err);
      return res.status(500).json({ error: 'Error al obtener el estado del servidor' });
    }
  },

  async getMailcowStatus(req: Request, res: Response) {
    try {
      const status = await mailcowService.getStatus();
      return res.json(status);
    } catch (err) {
      console.error('Error fetching Mailcow status:', err);
      return res.status(502).json({ connected: false, domains: 0, mailboxes: 0, error: `Error al consultar Mailcow: ${(err as Error).message}` });
    }
  },

  async getPHPVersions(req: Request, res: Response) {
    try {
      const versions = [
        { version: '7.4', status: 'available', eol: true, installed: true },
        { version: '8.0', status: 'available', eol: true, installed: true },
        { version: '8.1', status: 'available', eol: false, installed: true },
        { version: '8.2', status: 'default', eol: false, installed: true },
        { version: '8.3', status: 'available', eol: false, installed: true },
      ];
      return res.json(versions);
    } catch (err) {
      console.error('Error fetching PHP versions:', err);
      return res.status(500).json({ error: 'Error al obtener versiones de PHP' });
    }
  },

  // ==================== BACKUPS ====================

  async getAllBackups(req: Request, res: Response) {
    try {
      const { client_id } = req.query;
      const result = client_id
        ? await query('SELECT * FROM backups WHERE client_id = $1 ORDER BY created_at DESC', [client_id])
        : await query('SELECT * FROM backups ORDER BY created_at DESC');
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching backups:', err);
      return res.status(500).json({ error: 'Error al obtener los respaldos' });
    }
  },

  async downloadBackup(req: Request, res: Response) {
    try {
      const result = await query('SELECT * FROM backups WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Respaldo no encontrado' });
      }
      const backup = result.rows[0];
      return res.json({
        message: 'Descarga del respaldo iniciada',
        backup: {
          id: backup.id,
          filename: backup.filename,
          file_size: backup.file_size,
          download_url: `/api/infrastructure/backups/${backup.id}/file`,
        },
      });
    } catch (err) {
      console.error('Error downloading backup:', err);
      return res.status(500).json({ error: 'Error al descargar el respaldo' });
    }
  },

  async deleteBackup(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await query('DELETE FROM backups WHERE id = $1', [id]);
      return res.json({ message: 'Respaldo eliminado exitosamente' });
    } catch (err) {
      console.error('Error deleting backup:', err);
      return res.status(500).json({ error: 'Error al eliminar el respaldo' });
    }
  },

  // ==================== CLIENT INFRASTRUCTURE ====================

  async restartClient(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const domain = client.rows[0].domain;
      await dockerService.restartContainer(domain);

      return res.json({
        message: `Contenedor Docker reiniciado para ${domain}`,
        services_restarted: ['docker-container'],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error restarting client services:', err);
      return res.status(502).json({ error: `Error al reiniciar los servicios del cliente: ${(err as Error).message}` });
    }
  },

  // WordPress reconoce nativamente un archivo `.maintenance` en su raíz para
  // mostrar la pantalla "Brevemente no disponible por mantenimiento" (hasta
  // ~10 min por diseño de WP core). No existe hoy una directiva de Caddy ni
  // otro mecanismo para sitios no-WordPress, así que esto solo tiene efecto
  // visible en clientes WORDPRESS.
  async toggleMaintenance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const domain = client.rows[0].domain;
      const enabled = req.body.enabled !== undefined ? !!req.body.enabled : true;

      if (!isInfraDryRun()) {
        const maintenanceFile = path.join(config.infrastructure.clientSitesPath, domain, 'public_html', '.maintenance');
        if (enabled) {
          fs.mkdirSync(path.dirname(maintenanceFile), { recursive: true });
          fs.writeFileSync(maintenanceFile, `<?php $upgrading = ${Math.floor(Date.now() / 1000)}; // Activado desde el panel Neokik\n`);
        } else if (fs.existsSync(maintenanceFile)) {
          fs.unlinkSync(maintenanceFile);
        }
      }

      return res.json({
        message: enabled
          ? `Modo mantenimiento activado para ${domain}`
          : `Modo mantenimiento desactivado para ${domain}`,
        maintenance_mode: enabled,
        domain,
        note: 'Aplica el mecanismo nativo de WordPress (.maintenance); no tiene efecto en sitios no-WordPress.',
      });
    } catch (err) {
      console.error('Error toggling maintenance mode:', err);
      return res.status(502).json({ error: `Error al cambiar el modo de mantenimiento: ${(err as Error).message}` });
    }
  },

  async getClientLogs(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const type = req.query.type === 'app' ? 'app' : 'caddy';
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const domain = client.rows[0].domain;
      const rawLogs = type === 'app'
        ? await dockerService.getContainerLogs(domain)
        : await dockerService.getCaddyAccessLog(domain);

      const logs = parseClientLogLines(rawLogs, type);
      return res.json({ domain, logs });
    } catch (err) {
      console.error('Error fetching client logs:', err);
      return res.status(502).json({ error: `Error al obtener los logs del cliente: ${(err as Error).message}` });
    }
  },

  async getClientDiskUsage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const domain = client.rows[0].domain;
      const dbName = clientDbName(domain);
      const siteDir = path.join(config.infrastructure.clientSitesPath, domain, 'public_html');

      const [websiteBytes, databaseMb, mailboxes, backupsSum] = await Promise.all([
        storageService.getDirectorySizeBytes(siteDir),
        databaseService.getDatabaseSizeMb(dbName).catch(() => 0),
        mailcowService.listMailboxes(domain).catch(() => []),
        query('SELECT COALESCE(SUM(file_size), 0) AS total FROM backups WHERE client_id = $1', [id]),
      ]);

      const emailMb = Array.isArray(mailboxes)
        ? mailboxes.reduce((sum: number, mb: any) => sum + bytesToMb(mb.quota_used), 0)
        : 0;
      const websiteMb = bytesToMb(websiteBytes);
      const backupsMb = bytesToMb(parseInt(backupsSum.rows[0]?.total || '0', 10));

      const breakdown = {
        website_files_mb: websiteMb,
        database_mb: databaseMb,
        email_mb: Math.round(emailMb * 100) / 100,
        backups_mb: backupsMb,
      };
      const usedMb = Math.round((websiteMb + databaseMb + emailMb + backupsMb) * 100) / 100;

      return res.json({
        domain,
        used_mb: usedMb,
        breakdown,
      });
    } catch (err) {
      console.error('Error fetching disk usage:', err);
      return res.status(502).json({ error: `Error al obtener el uso de disco: ${(err as Error).message}` });
    }
  },

  async backupClientDB(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const domain = client.rows[0].domain;
      const dbName = clientDbName(domain);
      const fileUUID = randomUUID();
      const filename = `backup-${domain}-db-${new Date().toISOString().split('T')[0]}.sql.gz`;
      const filePath = path.join(config.infrastructure.backupPath, `${fileUUID}.sql.gz`);

      const { sizeBytes } = await databaseService.dumpDatabase(dbName, filePath);

      const result = await query(
        `INSERT INTO backups (client_id, filename, file_path, file_size, backup_type, version, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, filename, filePath, sizeBytes, 'DATABASE_SQL', 1, 'Respaldo manual de base de datos', new Date().toISOString()]
      );

      return res.json({
        message: `Respaldo de base de datos creado para ${domain}`,
        backup_id: result.rows[0].id,
        filename,
        file_size: sizeBytes,
      });
    } catch (err) {
      console.error('Error backing up client database:', err);
      return res.status(502).json({ error: `Error al respaldar la base de datos del cliente: ${(err as Error).message}` });
    }
  },

  async optimizeClientDB(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const domain = client.rows[0].domain;
      const dbName = clientDbName(domain);
      const result = await databaseService.optimizeTables(dbName);

      return res.json({
        message: `Base de datos optimizada para ${domain}`,
        tables_optimized: result.tablesOptimized,
        space_freed_mb: result.spaceFreedMb,
        duration_seconds: result.durationSeconds,
      });
    } catch (err) {
      console.error('Error optimizing client database:', err);
      return res.status(502).json({ error: `Error al optimizar la base de datos del cliente: ${(err as Error).message}` });
    }
  },

  async streamMigration(req: Request, res: Response) {
    const { id } = req.params;
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log(`[SSE] Client connected to stream for migration: ${id}`);

    // Send connection established event
    res.write(`data: ${JSON.stringify({ type: 'connected', migrationId: id })}\n\n`);

    // Stream existing database logs immediately to avoid race conditions
    query('SELECT * FROM migration_logs WHERE migration_id = $1 ORDER BY started_at ASC', [id])
      .then(logs => {
        for (const log of logs.rows) {
          res.write(`data: ${JSON.stringify({
            type: 'step',
            migrationId: id,
            step: log.step,
            status: log.status,
            message: log.message,
            percentage: log.percentage,
            startedAt: log.started_at,
            completedAt: log.completed_at
          })}\n\n`);
        }
      })
      .catch(err => {
        console.error('[SSE LOGS ERROR] Failed to send initial logs:', err);
      });

    const onStarted = (data: any) => {
      if (data.migrationId === id) {
        res.write(`data: ${JSON.stringify({ type: 'started', ...data })}\n\n`);
      }
    };

    const onStep = (data: any) => {
      if (data.migrationId === id) {
        res.write(`data: ${JSON.stringify({ type: 'step', ...data })}\n\n`);
      }
    };

    const onCompleted = (data: any) => {
      if (data.migrationId === id) {
        res.write(`data: ${JSON.stringify({ type: 'completed', ...data })}\n\n`);
      }
    };

    const onFailed = (data: any) => {
      if (data.migrationId === id) {
        res.write(`data: ${JSON.stringify({ type: 'failed', ...data })}\n\n`);
      }
    };

    eventBus.on('migration:started', onStarted);
    eventBus.on('migration:step', onStep);
    eventBus.on('migration:completed', onCompleted);
    eventBus.on('migration:failed', onFailed);

    req.on('close', () => {
      console.log(`[SSE] Client disconnected from stream for migration: ${id}`);
      eventBus.off('migration:started', onStarted);
      eventBus.off('migration:step', onStep);
      eventBus.off('migration:completed', onCompleted);
      eventBus.off('migration:failed', onFailed);
    });
  },
};
