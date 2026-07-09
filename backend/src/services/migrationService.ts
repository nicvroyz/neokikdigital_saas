import { query } from '../config/db';
import { config } from '../config/env';
import { backupAnalyzerService } from './backupAnalyzerService';
import { dnsAnalyzerService } from './dnsAnalyzerService';
import { mailcowService } from './mailcowService';
import { dockerService } from './dockerService';
import { databaseService } from './databaseService';
import { sslService } from './sslService';
import { healthService } from './healthService';
import { storageService } from './storageService';
import { wordpressPlugin } from './plugins/wordpressPlugin';
import { laravelPlugin } from './plugins/laravelPlugin';
import { staticHtmlPlugin } from './plugins/staticHtmlPlugin';
import { eventBus } from './eventBus';
import { clientService } from './clientService';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { AsyncLocalStorage } from 'async_hooks';

export const correlationStorage = new AsyncLocalStorage<string>();

function log(msg: string) {
  const correlationId = correlationStorage.getStore();
  const prefix = correlationId ? ` [${correlationId}]` : '';
  console.log(`[${new Date().toISOString()}] [MIGRATION SERVICE]${prefix} ${msg}`);
}

export const migrationService = {
  async getMigration(id: string) {
    const res = await query('SELECT * FROM migrations WHERE id = $1', [id]);
    return res.rows[0];
  },

  async getAllMigrations() {
    const res = await query('SELECT * FROM migrations ORDER BY created_at DESC');
    return res.rows;
  },

  async getMigrationLogs(migrationId: string) {
    const res = await query('SELECT * FROM migration_logs WHERE migration_id = $1 ORDER BY started_at ASC', [migrationId]);
    return res.rows;
  },

  async analyzeBackup(migrationId: string, filePath: string, backupType: string) {
    log(`Iniciando análisis del respaldo para la migración: ${migrationId}`);
    
    // Update status to ANALYZING
    await query('UPDATE migrations SET status = \'ANALYZING\', updated_at = $1 WHERE id = $2', [new Date().toISOString(), migrationId]);
    
    // Call backup analyzer
    const report = await backupAnalyzerService.analyzeBackup(filePath, backupType);
    
    // Update migrations record with analysis results
    await query(
      `UPDATE migrations 
       SET status = 'READY', 
           domain = $1,
           detected_project_type = $2, 
           analysis_report = $3, 
           migration_score = $4,
           updated_at = $5 
       WHERE id = $6`,
      [report.domains.primary, report.projectType, JSON.stringify(report), report.projectTypeConfidence, new Date().toISOString(), migrationId]
    );

    // Insert log
    await query(
      `INSERT INTO migration_logs (id, migration_id, step, message, status, percentage, started_at, completed_at)
       VALUES ($1, $2, 'analyze_backup', 'Análisis del respaldo completado con éxito.', 'SUCCESS', 15, $3, $4)`,
      [`mlog-${Date.now()}`, migrationId, new Date().toISOString(), new Date().toISOString()]
    );

    return report;
  },

  async executeMigration(migrationId: string) {
    const correlationId = `corr-${Math.random().toString(36).substring(2, 10)}`;
    return correlationStorage.run(correlationId, async () => {
      log(`Iniciando proceso transaccional de migración: ${migrationId}`);
      
      const mig = await this.getMigration(migrationId);
      if (!mig) throw new Error('Migración no encontrada');

      const domain = mig.domain || 'midominio.cl';
      const backupPath = mig.backup_path;
      const destDir = path.join(os.tmpdir(), 'neokik-migration', migrationId);

      // Reset logs
      await query('DELETE FROM migration_logs WHERE migration_id = $1', [migrationId]);
      
      // Update main status
    await query(
      `UPDATE migrations 
       SET status = 'MIGRATING', 
           current_step = 'EXTRACTING_BACKUP', 
           started_at = $1, 
           updated_at = $2 
       WHERE id = $3`,
      [new Date().toISOString(), new Date().toISOString(), migrationId]
    );

    eventBus.emit('migration:started', { migrationId, domain });

    try {
      // Step 1: Extract Backup (10%)
      log('Paso 1: Extrayendo respaldo...');
      await this.logStep(migrationId, 'backup:extracting', 'Extrayendo archivos del respaldo cPanel...', 'RUNNING', 10);
      await storageService.extract(backupPath, destDir);
      await this.logStep(migrationId, 'backup:extracting', 'Respaldo extraído exitosamente.', 'SUCCESS', 20);
      await query('UPDATE migrations SET rollback_step = \'CLEANUP_EXTRACTED\' WHERE id = $1', [migrationId]);

      // Step 2: Create MySQL database and import data (25%)
      log('Paso 2: Creando base de datos MySQL...');
      await this.logStep(migrationId, 'database:restoring', 'Creando base de datos y usuario en contenedor MySQL...', 'RUNNING', 30);
      const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const dbUser = `user_${domain.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10)}`;
      const dbPass = `Pass_${Math.random().toString(36).substring(2, 10)}!`;
      
      await databaseService.createDatabase(dbName, dbUser, dbPass);
      
      // Look for SQL dump in backup
      const sqlDir = path.join(destDir, 'mysql');
      let sqlFile = '';
      if (fs.existsSync(sqlDir)) {
        const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'));
        if (files.length > 0) sqlFile = path.join(sqlDir, files[0]);
      }
      
      if (sqlFile) {
        await this.logStep(migrationId, 'database:restoring', `Importando archivo de base de datos ${path.basename(sqlFile)}...`, 'RUNNING', 40);
        await databaseService.importSQLDump(dbName, sqlFile);
      }
      
      await this.logStep(migrationId, 'database:restoring', 'Base de datos MySQL configurada e importada.', 'SUCCESS', 50);
      await query('UPDATE migrations SET rollback_step = \'DROP_DATABASE\' WHERE id = $1', [migrationId]);

      // Apply framework configurations
      log('Aplicando reconfiguraciones de archivos específicas del framework...');
      await this.logStep(migrationId, 'plugin:executing', 'Reconfigurando archivos del framework (wp-config.php/env)...', 'RUNNING', 55);
      const dbConfig = { dbName, dbUser, dbPass, dbHost: 'mysql-container' };
      if (mig.detected_project_type === 'WORDPRESS') {
        await wordpressPlugin.onMigrate(domain, destDir, dbConfig);
      } else if (mig.detected_project_type === 'LARAVEL') {
        await laravelPlugin.onMigrate(domain, destDir, dbConfig);
      } else if (mig.detected_project_type === 'HTML') {
        await staticHtmlPlugin.onMigrate(domain, destDir, dbConfig);
      }

      // Step 3: Create Container (40%)
      log('Paso 3: Creando contenedor Docker...');
      await this.logStep(migrationId, 'container:creating', 'Creando y enlazando contenedor Docker con volumenes...', 'RUNNING', 60);
      await dockerService.createContainer(domain, mig.detected_project_type || 'WORDPRESS', '8.2');
      await this.logStep(migrationId, 'container:creating', 'Contenedor Docker iniciado y enlazado correctamente.', 'SUCCESS', 70);
      await query('UPDATE migrations SET rollback_step = \'REMOVE_CONTAINER\' WHERE id = $1', [migrationId]);

      // Execute framework post-migration commands
      let commands: string[] = [];
      if (mig.detected_project_type === 'WORDPRESS') {
        commands = await wordpressPlugin.getMigrationCommands(domain, destDir);
      } else if (mig.detected_project_type === 'LARAVEL') {
        commands = await laravelPlugin.getMigrationCommands(domain, destDir);
      } else if (mig.detected_project_type === 'HTML') {
        commands = await staticHtmlPlugin.getMigrationCommands(domain, destDir);
      }

      if (commands.length > 0) {
        log('Ejecutando comandos post-migración del framework...');
        for (const cmd of commands) {
          try {
            const isDryRun = !!config.caddy.dryRun;
            if (!isDryRun) {
              const { execSync } = require('child_process');
              execSync(cmd);
            } else {
              log(`[DRY RUN SIMULATE CMD] ${cmd}`);
            }
          } catch (cmdErr) {
            console.error(`[COMMAND ERROR] Failed to run command: ${cmd}`, cmdErr);
          }
        }
      }
      await this.logStep(migrationId, 'plugin:executing', 'Plugins del framework configurados y comandos ejecutados.', 'SUCCESS', 72);

      // Step 4: Configure SSL on Proxy Caddy (55%)
      log('Paso 4: Configurando Caddy/SSL...');
      await this.logStep(migrationId, 'ssl:generating', 'Configurando enrutamiento seguro y recargando Caddy...', 'RUNNING', 75);
      await sslService.configureSSL(domain);
      await this.logStep(migrationId, 'ssl:generating', 'Enrutamiento SSL Let\'s Encrypt configurado.', 'SUCCESS', 80);

      // Step 5: Mailcow integration - Full email migration with content copy (70%)
      log('Paso 5: Integración Mailcow...');
      await this.logStep(migrationId, 'mailcow:restoring', 'Creando dominio y buzones de correo en Mailcow API...', 'RUNNING', 85);
      await mailcowService.createDomain(domain);
      
      // Parse analysis report for detected email accounts
      let analysisReport: any = null;
      try {
        analysisReport = typeof mig.analysis_report === 'string' ? JSON.parse(mig.analysis_report) : mig.analysis_report;
      } catch { /* ignore parse errors */ }

      const emailDomains = analysisReport?.emails || [];
      const allAccounts: { local_part: string; domain: string; quota: string; messageCount: number; folders: string[] }[] = [];
      
      for (const emailDomain of emailDomains) {
        if (emailDomain.accounts && Array.isArray(emailDomain.accounts)) {
          for (const acc of emailDomain.accounts) {
            const localPart = acc.address?.split('@')[0] || 'contacto';
            allAccounts.push({
              local_part: localPart,
              domain: emailDomain.domain || domain,
              quota: acc.quota || '500 MB',
              messageCount: acc.messageCount || 0,
              folders: acc.folders || ['INBOX', 'Sent', 'Drafts', 'Trash']
            });
          }
        }
      }

      // Fallback: if no accounts detected, create a default one
      if (allAccounts.length === 0) {
        allAccounts.push({
          local_part: 'contacto',
          domain,
          quota: '500 MB',
          messageCount: 0,
          folders: ['INBOX', 'Sent', 'Drafts', 'Trash']
        });
      }

      // Create all mailboxes and migrate content
      const isDryRunMode = !!config.caddy.dryRun;
      const migrationResults: string[] = [];
      let totalSourceMessages = 0;
      let totalDestMessages = 0;

      let currentMailboxIndex = 0;
      const totalMailboxes = allAccounts.length;
      for (const acc of allAccounts) {
        currentMailboxIndex++;
        const email = `${acc.local_part}@${acc.domain}`;
        const password = `Temp_${Math.random().toString(36).substring(2, 10)}!`;
        const quotaMB = parseInt(acc.quota) || 512;

        try {
          await this.logStep(
            migrationId, 
            'mailcow:restoring', 
            `Migrando buzón ${currentMailboxIndex}/${totalMailboxes}: ${email} (${acc.messageCount} mensajes)...`, 
            'RUNNING', 
            80 + Math.floor((currentMailboxIndex / totalMailboxes) * 10)
          );

          await mailcowService.createMailbox({
            local_part: acc.local_part,
            domain: acc.domain,
            password,
            quota: quotaMB,
            name: acc.local_part.charAt(0).toUpperCase() + acc.local_part.slice(1)
          });

          // Maildir content migration
          const sourceMaildirPaths = [
            path.join(destDir, 'mail', acc.domain, acc.local_part),
            path.join(destDir, 'homedir', 'mail', acc.domain, acc.local_part)
          ];

          let sourceMaildir = '';
          for (const p of sourceMaildirPaths) {
            if (fs.existsSync(p)) {
              sourceMaildir = p;
              break;
            }
          }

          const sourceCount = acc.messageCount;
          totalSourceMessages += sourceCount;

          if (isDryRunMode) {
            // DryRun: simulate Maildir copy by creating dummy files in temp dir
            const dryMaildir = path.join(os.tmpdir(), 'neokik-migration', migrationId, 'vmail', acc.domain, acc.local_part, 'cur');
            fs.mkdirSync(dryMaildir, { recursive: true });
            for (let i = 0; i < Math.min(sourceCount, 5); i++) {
              fs.writeFileSync(path.join(dryMaildir, `msg_${i}.eml`), `From: test@${acc.domain}\nSubject: Migrated message ${i}\n\nDummy email content for simulation.`);
            }
            // Count dummy files as "destination messages" to match source count in simulation
            totalDestMessages += sourceCount;
            log(`[DRY RUN] Simulado copia de ${sourceCount} mensajes para ${email}`);
            migrationResults.push(`${email}: ${sourceCount} mensajes migrados (simulado)`);
          } else if (sourceMaildir) {
            // Production: copy Maildir content to Mailcow vmail volume using docker cp
            try {
              const { execSync } = require('child_process');
              const containerId = execSync("docker ps -q -f name=dovecot-mailcow").toString().trim();
              if (containerId) {
                log(`Integración Mailcow: Copiando correos para ${email} mediante docker cp...`);
                // Ensure target directory exists inside the container
                execSync(`docker exec ${containerId} mkdir -p /var/vmail/${acc.domain}/${acc.local_part}`);
                // Copy the local Maildir directory contents using docker cp
                execSync(`docker cp "${sourceMaildir}/." ${containerId}:/var/vmail/${acc.domain}/${acc.local_part}/`);
                // Set correct ownership inside the container
                execSync(`docker exec ${containerId} chown -R vmail:vmail /var/vmail/${acc.domain}/${acc.local_part}`);
                // Rebuild Dovecot index
                execSync(`docker exec ${containerId} doveadm force-resync -u ${email} '*'`);
                
                // Verify message count inside container
                const destCountOutput = execSync(`docker exec ${containerId} find "/var/vmail/${acc.domain}/${acc.local_part}" -path "*/cur/*" -o -path "*/new/*" -type f | wc -l`).toString().trim();
                const destCount = parseInt(destCountOutput) || 0;
                totalDestMessages += destCount;
                
                if (sourceCount > 0 && destCount === 0) {
                  log(`ADVERTENCIA: ${email} - 0 mensajes en destino pero ${sourceCount} esperados`);
                  migrationResults.push(`${email}: ⚠️ ${destCount} de ${sourceCount} mensajes — verificar copia`);
                } else {
                  migrationResults.push(`${email}: ${destCount} de ${sourceCount} mensajes migrados correctamente`);
                }
              } else {
                throw new Error('Contenedor dovecot-mailcow no encontrado');
              }
            } catch (rsyncErr) {
              log(`Error al copiar Maildir para ${email}: ${(rsyncErr as Error).message}`);
              migrationResults.push(`${email}: ❌ Falló copia de correos`);
            }
          } else {
            // No source maildir found - mailbox created empty
            totalDestMessages += 0;
            migrationResults.push(`${email}: buzón creado (sin contenido Maildir en backup)`);
          }
        } catch (mbErr) {
          log(`Error al crear buzón ${email}: ${(mbErr as Error).message}`);
          migrationResults.push(`${email}: ❌ Error al crear buzón`);
        }
      }

      const mailSummary = `${allAccounts.length} buzones procesados. ${migrationResults.join(' | ')}`;
      
      // Verify overall message count parity
      if (!isDryRunMode && totalSourceMessages > 0 && totalDestMessages === 0) {
        await this.logStep(migrationId, 'mailcow:restoring', `${totalDestMessages} de ${totalSourceMessages} mensajes migrados — fallo en la copia de contenido`, 'FAILED', 90);
        throw new Error(`Fallo en migración de correos: ${totalDestMessages} de ${totalSourceMessages} mensajes migrados`);
      }

      await this.logStep(migrationId, 'mailcow:restoring', `Dominio y ${allAccounts.length} buzones configurados. Contenido IMAP restaurado. ${totalSourceMessages > 0 ? totalDestMessages + ' de ' + totalSourceMessages + ' mensajes migrados.' : ''}`, 'SUCCESS', 90);

      // Step 6: Post Migration Health Audits (90%)
      log('Paso 6: Ejecutando Auditoría de Salud...');
      await this.logStep(migrationId, 'verification:running', 'Verificando DNS, HTTPS, SSL, puertos SMTP e IMAP...', 'RUNNING', 95);
      const audit = await healthService.runAudit(domain);
      
      await this.logStep(migrationId, 'verification:running', `Auditoría finalizada. Score de Salud: ${audit.overall_score}%`, 'SUCCESS', 100);

      // Finalize
      await query(
        `UPDATE migrations 
         SET status = 'COMPLETED', 
             current_step = 'COMPLETED', 
             completed_at = $1, 
             updated_at = $2 
         WHERE id = $3`,
        [new Date().toISOString(), new Date().toISOString(), migrationId]
      );

      // Register the client in the database automatically upon successful migration
      try {
        const existingClient = await query('SELECT * FROM clients WHERE domain = $1', [domain]);
        if (existingClient.rows.length === 0) {
          log(`Migración completada con éxito. Registrando automáticamente nuevo cliente para: ${domain}`);
          
          const clientName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
          let clientEmail = `contacto@${domain}`;
          
          try {
            const report = typeof mig.analysis_report === 'string' ? JSON.parse(mig.analysis_report) : mig.analysis_report;
            if (report && report.emails && report.emails[0] && report.emails[0].accounts && report.emails[0].accounts[0]) {
              clientEmail = report.emails[0].accounts[0].address;
            }
          } catch {}

          await clientService.createClient({
            name: clientName,
            company_name: clientName + ' Sp SpA',
            email: clientEmail,
            domain: domain,
            service_type: 'HOSTING_AND_MAINTENANCE',
            plan_interval: 'MONTHLY',
            amount_per_period: 0, // Set to 0 CLP/USD so the plan can be configured manually later
            currency: 'CLP',
            status: 'ACTIVE',
            last_payment_date: new Date().toISOString().split('T')[0],
            expiration_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0], // 30 days initial trial
            grace_period_days: 5,
            doc_root: `/srv/neokik/sites/${domain}`,
            notes: `Cliente registrado automáticamente a través del motor de migración cPanel el ${new Date().toLocaleDateString('es-CL')}.`
          });
          log(`Registro del cliente para ${domain} creado con éxito.`);
        } else {
          log(`El cliente con el dominio ${domain} ya existe en el sistema. Omitiendo duplicación.`);
        }
      } catch (clientErr) {
        log(`Error registrando el cliente migrado: ${(clientErr as Error).message}`);
      }

      eventBus.emit('migration:completed', { migrationId });

      // Restore database state / client state to the last consistent checkpoint
      try {
        log('Rollback: Eliminando registro de cliente...');
        await query('DELETE FROM clients WHERE domain = $1', [domain]);
      } catch (err) { /* ignore */ }

      // Restore database state / client state to the last consistent checkpoint
      try {
        if (!mig.client_id) {
          log('Rollback: Eliminando registro de cliente auto-creado...');
          await query('DELETE FROM clients WHERE domain = $1', [domain]);
        } else {
          log('Rollback: Cliente pre-existía antes de la migración. Conservando registro de cliente.');
        }
      } catch (err) { /* ignore */ }

      // Cleanup target host site directory if created and safe
      try {
        const baseRoot = path.resolve(config.caddy.baseDocRoot);
        const targetSiteDir = path.resolve(path.join(baseRoot, domain));
        
        if (targetSiteDir.startsWith(baseRoot) && targetSiteDir !== baseRoot && domain && domain.includes('.')) {
          if (fs.existsSync(targetSiteDir)) {
            log(`Rollback: Eliminando directorio del sitio verificado: ${targetSiteDir}`);
            await storageService.cleanup(targetSiteDir);
          }
        }
      } catch (dirErr) {
        log(`Advertencia en Rollback: falló limpieza de directorio: ${(dirErr as Error).message}`);
      }

      // Cleanup files
      await storageService.cleanup(destDir);

    } catch (err) {
      const errMsg = (err as Error).message || 'Error desconocido';
      log(`Error crítico en la migración ${migrationId}: ${errMsg}`);
      
      await query(
        `UPDATE migrations 
         SET status = 'FAILED', 
             error_log = $1, 
             updated_at = $2 
         WHERE id = $3`,
        [errMsg, new Date().toISOString(), migrationId]
      );
      
      eventBus.emit('migration:failed', { migrationId, error: errMsg });
      
      await this.logStep(migrationId, 'execution_error', `Error crítico: ${errMsg}. Iniciando Rollback automático...`, 'FAILED', 0);
      throw err;
    }
    });
  },

  async logStep(migrationId: string, step: string, message: string, status: 'SUCCESS' | 'FAILED' | 'RUNNING', percentage: number) {
    const logId = `mlog-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    
    // Check if the step log already exists to update it or create new
    const existing = await query('SELECT * FROM migration_logs WHERE migration_id = $1 AND step = $2', [migrationId, step]);
    
    if (existing.rows.length > 0) {
      await query(
        `UPDATE migration_logs 
         SET message = $1, status = $2, percentage = $3, completed_at = $4 
         WHERE id = $5`,
        [message, status, percentage, status === 'SUCCESS' || status === 'FAILED' ? new Date().toISOString() : null, existing.rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO migration_logs (id, migration_id, step, message, status, percentage, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [logId, migrationId, step, message, status, percentage, new Date().toISOString()]
      );
    }
    
    await query('UPDATE migrations SET current_step = $1, updated_at = $2 WHERE id = $3', [step, new Date().toISOString(), migrationId]);
    eventBus.emit('migration:step', { migrationId, step, message, status, percentage });
  },

  async rollbackMigration(migrationId: string) {
    log(`Ejecutando Rollback para la migración: ${migrationId}`);
    
    const mig = await this.getMigration(migrationId);
    if (!mig) return;

    const domain = mig.domain;
    const rollbackStep = mig.rollback_step;
    const destDir = path.join(__dirname, '../../uploads/extracted', migrationId);

    try {
      if (rollbackStep === 'REMOVE_CONTAINER' || rollbackStep === 'DROP_DATABASE' || rollbackStep === 'CLEANUP_EXTRACTED') {
        log('Rollback: Eliminando contenedor Docker...');
        await dockerService.removeContainer(domain);
      }
      
      if (rollbackStep === 'DROP_DATABASE') {
        log('Rollback: Eliminando base de datos MySQL...');
        const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await databaseService.dropDatabase(dbName);
      }
      
      // Cleanup files
      await storageService.cleanup(destDir);
      
      await query('UPDATE migrations SET status = \'ROLLED_BACK\', current_step = \'ROLLED_BACK\', updated_at = $1 WHERE id = $2', [new Date().toISOString(), migrationId]);
      log('Rollback de migración completado.');
    } catch (err) {
      console.error('[MIGRATION SERVICE ERROR] Failed to rollback migration', err);
    }
  },

  async deleteMigration(id: string) {
    const mig = await this.getMigration(id);
    if (mig && mig.backup_path && fs.existsSync(mig.backup_path)) {
      try {
        fs.unlinkSync(mig.backup_path);
      } catch { /* ignore */ }
    }
    await query('DELETE FROM migrations WHERE id = $1', [id]);
  }
};
