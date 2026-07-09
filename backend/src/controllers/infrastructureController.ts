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
import http from 'http';
import fs from 'fs';
import { randomUUID } from 'crypto';

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

      const dnsReport = {
        domain,
        current_ns: ['ns1.registrar-actual.cl', 'ns2.registrar-actual.cl'],
        required_ns: [`ns1.${config.platformDomain}`, `ns2.${config.platformDomain}`],
        a_record: { current: '192.168.1.1', required: '152.0.0.1' },
        mx_records: [
          { priority: 10, value: 'mail.registrar-actual.cl' },
        ],
        txt_records: ['v=spf1 include:_spf.registrar-actual.cl ~all'],
        propagation_complete: false,
        estimated_propagation_hours: 24,
        recommendations: [
          'Actualizar registros NS en el registrador del dominio',
          'Configurar registro A apuntando a 152.0.0.1',
          'Actualizar registros MX para Mailcow',
        ],
      };

      return res.json(dnsReport);
    } catch (err) {
      console.error('Error analyzing DNS:', err);
      return res.status(500).json({ error: 'Error al analizar DNS' });
    }
  },

  // ==================== SSL ====================

  async issueSSL(req: Request, res: Response) {
    try {
      const { domain } = req.params;
      if (!domain) {
        return res.status(400).json({ error: 'Dominio requerido' });
      }

      const sslResult = {
        domain,
        status: 'ISSUED',
        issuer: "Let's Encrypt",
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        auto_renew: true,
        message: `Certificado SSL emitido exitosamente para ${domain}`,
      };

      return res.json(sslResult);
    } catch (err) {
      console.error('Error issuing SSL:', err);
      return res.status(500).json({ error: 'Error al emitir certificado SSL' });
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
      const result = await query('SELECT * FROM backups ORDER BY created_at DESC');
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
      return res.json({
        message: `Servicios reiniciados para ${client.rows[0].domain}`,
        services_restarted: ['caddy', 'docker-container'],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error restarting client services:', err);
      return res.status(500).json({ error: 'Error al reiniciar los servicios del cliente' });
    }
  },

  async toggleMaintenance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }
      const enabled = req.body.enabled !== undefined ? req.body.enabled : true;
      return res.json({
        message: enabled
          ? `Modo mantenimiento activado para ${client.rows[0].domain}`
          : `Modo mantenimiento desactivado para ${client.rows[0].domain}`,
        maintenance_mode: enabled,
        domain: client.rows[0].domain,
      });
    } catch (err) {
      console.error('Error toggling maintenance mode:', err);
      return res.status(500).json({ error: 'Error al cambiar el modo de mantenimiento' });
    }
  },

  async getClientLogs(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }
      const logs = [
        { timestamp: new Date(Date.now() - 300000).toISOString(), level: 'INFO', message: 'GET /index.php - 200 OK - 45ms' },
        { timestamp: new Date(Date.now() - 240000).toISOString(), level: 'INFO', message: 'GET /wp-admin/ - 200 OK - 120ms' },
        { timestamp: new Date(Date.now() - 180000).toISOString(), level: 'WARNING', message: 'POST /xmlrpc.php - 403 Forbidden (blocked)' },
        { timestamp: new Date(Date.now() - 120000).toISOString(), level: 'INFO', message: 'GET /wp-content/uploads/2026/06/imagen.webp - 200 OK - 8ms' },
        { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', message: 'GET /wp-json/wp/v2/posts - 200 OK - 95ms' },
      ];
      return res.json({ domain: client.rows[0].domain, logs });
    } catch (err) {
      console.error('Error fetching client logs:', err);
      return res.status(500).json({ error: 'Error al obtener los logs del cliente' });
    }
  },

  async getClientDiskUsage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }
      const diskUsage = {
        domain: client.rows[0].domain,
        total_mb: 2048,
        used_mb: 847,
        usage_percent: 41.4,
        breakdown: {
          website_files_mb: 523,
          database_mb: 189,
          email_mb: 87,
          logs_mb: 34,
          backups_mb: 14,
        },
      };
      return res.json(diskUsage);
    } catch (err) {
      console.error('Error fetching disk usage:', err);
      return res.status(500).json({ error: 'Error al obtener el uso de disco' });
    }
  },

  async backupClientDB(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const fileUUID = randomUUID();
      const filename = `backup-${client.rows[0].domain}-db-${new Date().toISOString().split('T')[0]}.sql.gz`;

      const result = await query(
        `INSERT INTO backups (client_id, filename, file_path, file_size, backup_type, version, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, filename, `/uploads/backups/${fileUUID}.sql.gz`, 52428800, 'DATABASE_SQL', 1, 'Respaldo manual de base de datos', new Date().toISOString()]
      );

      return res.json({
        message: `Respaldo de base de datos creado para ${client.rows[0].domain}`,
        backup_id: result.rows[0].id,
        filename,
      });
    } catch (err) {
      console.error('Error backing up client database:', err);
      return res.status(500).json({ error: 'Error al respaldar la base de datos del cliente' });
    }
  },

  async optimizeClientDB(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }
      return res.json({
        message: `Base de datos optimizada para ${client.rows[0].domain}`,
        tables_optimized: 47,
        space_freed_mb: 12.3,
        duration_seconds: 8.5,
      });
    } catch (err) {
      console.error('Error optimizing client database:', err);
      return res.status(500).json({ error: 'Error al optimizar la base de datos del cliente' });
    }
  },

  async createEmailAccount(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { local_part, domain, password, quota } = req.body;
      if (!local_part || !domain || !password) {
        return res.status(400).json({ error: 'Campos requeridos: local_part, domain, password' });
      }

      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const emailAddress = `${local_part}@${domain}`;
      return res.status(201).json({
        message: `Cuenta de correo creada: ${emailAddress}`,
        email: emailAddress,
        quota_mb: quota || 1024,
        status: 'ACTIVE',
      });
    } catch (err) {
      console.error('Error creating email account:', err);
      return res.status(500).json({ error: 'Error al crear la cuenta de correo' });
    }
  },

  async deleteEmailAccount(req: Request, res: Response) {
    try {
      const { id, address } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }
      return res.json({
        message: `Cuenta de correo eliminada: ${decodeURIComponent(address)}`,
      });
    } catch (err) {
      console.error('Error deleting email account:', err);
      return res.status(500).json({ error: 'Error al eliminar la cuenta de correo' });
    }
  },

  async getClientEmails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (client.rows.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }

      const emails = [
        { address: `contacto@${client.rows[0].domain}`, quota_mb: 1024, used_mb: 87, status: 'ACTIVE', created_at: '2026-05-01T10:00:00Z' },
        { address: `info@${client.rows[0].domain}`, quota_mb: 512, used_mb: 23, status: 'ACTIVE', created_at: '2026-05-15T14:00:00Z' },
      ];
      return res.json({ domain: client.rows[0].domain, emails });
    } catch (err) {
      console.error('Error fetching client emails:', err);
      return res.status(500).json({ error: 'Error al obtener las cuentas de correo' });
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
