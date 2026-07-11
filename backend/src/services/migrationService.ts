import { query } from '../config/db';
import { execSync, execFileSync } from 'child_process';
import { config } from '../config/env';
import { backupAnalyzerService } from './backupAnalyzerService';
import { dnsAnalyzerService } from './dnsAnalyzerService';
import { mailcowService } from './mailcowService';
import { dockerService } from './dockerService';
import { databaseService } from './databaseService';
import { sslService } from './sslService';
import { healthService } from './healthService';
import { hostingService } from './hostingService';
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
import { randomUUID, randomBytes } from 'crypto';

export const correlationStorage = new AsyncLocalStorage<string>();
const executedRollbacks = new Set<string>();

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
      `INSERT INTO migration_logs (migration_id, step, message, status, percentage, started_at, completed_at)
       VALUES ($1, 'analyze_backup', 'Análisis del respaldo completado con éxito.', 'SUCCESS', 15, $2, $3)`,
      [migrationId, new Date().toISOString(), new Date().toISOString()]
    );

    return report;
  },

  async executeMigration(migrationId: string) {
    const correlationId = randomUUID();
    return correlationStorage.run(correlationId, async () => {
      log(`Iniciando proceso transaccional de migración: ${migrationId}`);
      
      const mig = await this.getMigration(migrationId);
      if (!mig) throw new Error('Migración no encontrada');

      // Prevent running if already failed or completed
      if (mig.status === 'FAILED' || mig.status === 'COMPLETED' || mig.status === 'ROLLED_BACK') {
        log(`La migración ${migrationId} ya está en estado final (${mig.status}). Abortando ejecución.`);
        return;
      }

      const domain = mig.domain;
      if (!domain) throw new Error('No se ha resuelto el dominio de la migración.');
      const backupPath = mig.backup_path;
      const destDir = path.join(config.infrastructure.storagePath, 'migrations', 'extracted', migrationId);
      const siteRoot = `${config.infrastructure.clientSitesPath}/${domain}`;
      const docRoot = path.join(siteRoot, 'public_html');

      let analysisReport: any = null;
      let emailDomains: any[] = [];
      const isDryRun = !!config.migration.dryRun;

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
        const plugin = mig.detected_project_type === 'WORDPRESS' ? wordpressPlugin : (mig.detected_project_type === 'HTML' ? staticHtmlPlugin : null);

        // Step 1: Extract Backup (10%)
        log('Paso 1: Extrayendo respaldo...');
        await this.logStep(migrationId, 'backup:extracting', 'Extrayendo archivos del respaldo cPanel...', 'RUNNING', 10);
        await storageService.extract(backupPath, destDir);
        await this.logStep(migrationId, 'backup:extracting', 'Respaldo extraído exitosamente.', 'SUCCESS', 20);
        await query('UPDATE migrations SET rollback_step = \'CLEANUP_EXTRACTED\' WHERE id = $1', [migrationId]);

        // Step 2: Detect document root (Rule 5 & Rule 7)
        log('Paso 2: Detectando directorio raíz del sitio web...');
        await this.logStep(migrationId, 'site:deploying', 'Detectando directorio raíz real del sitio web...', 'RUNNING', 25);
        let srcWebPath = destDir;
        if (plugin && typeof plugin.detectDocumentRoot === 'function') {
          srcWebPath = plugin.detectDocumentRoot(destDir);
        } else {
          // fallback
          const possibleWebPaths = [
            path.join(destDir, 'public_html'),
            path.join(destDir, 'homedir', 'public_html'),
            path.join(destDir, 'homedir')
          ];
          for (const p of possibleWebPaths) {
            if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
              srcWebPath = p;
              break;
            }
          }
        }

        // Step 3: Copiar únicamente los archivos del sitio (Rule 5)
        log(`Paso 3: Copiando archivos desde ${srcWebPath} al destino final...`);
        await this.logStep(migrationId, 'site:deploying', 'Desplegando archivos del sitio al almacenamiento de hosting...', 'RUNNING', 30);
        if (!fs.existsSync(docRoot)) {
          fs.mkdirSync(docRoot, { recursive: true });
        }
        await storageService.copy(srcWebPath, docRoot);
        await this.logStep(migrationId, 'site:deploying', 'Archivos del sitio desplegados correctamente.', 'SUCCESS', 40);

        // Step 4: Create MySQL Database / User (Rule 7)
        const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const dbUser = `user_${domain.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10)}`;
        const dbPass = `Pass_${randomBytes(4).toString('hex')}!`;
        const dbConfig = { dbName, dbUser, dbPass, dbHost: process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql' };

        log(`Credenciales generadas: DB_HOST=${dbConfig.dbHost}, DB_NAME=${dbConfig.dbName}, DB_USER=${dbConfig.dbUser}, DB_PASSWORD=********`);

        try {
          analysisReport = typeof mig.analysis_report === 'string' ? JSON.parse(mig.analysis_report) : mig.analysis_report;
        } catch { /* ignore parse errors */ }

        const hasDatabases = analysisReport?.databases && Array.isArray(analysisReport.databases) && analysisReport.databases.length > 0;

        if (hasDatabases) {
          log('Paso 4: Creando base de datos MySQL...');
          await this.logStep(migrationId, 'database:restoring', 'Creando base de datos y usuario en contenedor MySQL...', 'RUNNING', 45);
          await databaseService.createDatabase(dbName, dbUser, dbPass);
          await query('UPDATE migrations SET rollback_step = \'DROP_DATABASE\' WHERE id = $1', [migrationId]);
          await this.logStep(migrationId, 'database:restoring', 'Base de datos MySQL creada.', 'SUCCESS', 48);
        } else {
          log('Omitiendo creación de base de datos MySQL.');
          await this.logStep(migrationId, 'database:restoring', 'No se detectaron bases de datos. Omitiendo paso de base de datos.', 'SUCCESS', 48);
        }

        // Step 5: Configurar wp-config.php (Rule 6)
        if (plugin && typeof plugin.configureDatabaseConfig === 'function') {
          log('Paso 5: Configurando archivos de conexión a base de datos...');
          await this.logStep(migrationId, 'plugin:executing', 'Configurando archivos de conexión a base de datos (wp-config)...', 'RUNNING', 52);
          await plugin.configureDatabaseConfig(docRoot, dbConfig);
        }

        // Step 6: Crear contenedor
        log('Paso 6: Creando contenedor Docker...');
        await this.logStep(migrationId, 'container:creating', 'Creando y enlazando contenedor Docker con volumenes...', 'RUNNING', 55);
        await dockerService.createContainer(domain, mig.detected_project_type || 'WORDPRESS', '8.2', dbName, dbUser, dbPass);
        await query('UPDATE migrations SET rollback_step = \'REMOVE_CONTAINER\' WHERE id = $1', [migrationId]);

        // Step 7: Esperar que el contenedor esté listo (Rule 3)
        const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
        log(`Paso 7: Esperando que el contenedor ${containerName} esté listo...`);
        await this.logStep(migrationId, 'container:creating', 'Esperando que los servicios internos del contenedor estén listos...', 'RUNNING', 60);
        await dockerService.waitForContainerReady(containerName, mig.detected_project_type === 'WORDPRESS');
        await this.logStep(migrationId, 'container:creating', 'Contenedor Docker iniciado y enlazado correctamente.', 'SUCCESS', 63);

        // Step 8: Importar SQL dump (Rule 7)
        if (hasDatabases) {
          // Resolve backup root (handles single username directory wrapper in cPanel)
          const entries = fs.readdirSync(destDir).filter(e => !e.startsWith('.'));
          const backupRoot = entries.length === 1 && fs.statSync(path.join(destDir, entries[0])).isDirectory()
            ? path.join(destDir, entries[0])
            : destDir;

          const sqlDir = path.join(backupRoot, 'mysql');
          let sqlFile = '';
          if (fs.existsSync(sqlDir)) {
            const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'));
            if (files.length > 0) sqlFile = path.join(sqlDir, files[0]);
          }

          // Fallback: search recursively for any .sql / .sql.gz files in destDir
          if (!sqlFile) {
            const findSqlRecursive = (dir: string): string => {
              try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                  const fullPath = path.join(dir, file);
                  const stat = fs.statSync(fullPath);
                  if (stat.isDirectory()) {
                    if (['homedir', 'public_html', 'mail', 'logs', 'etc', 'ssl'].includes(file)) continue;
                    const found = findSqlRecursive(fullPath);
                    if (found) return found;
                  } else if (file.endsWith('.sql') || file.endsWith('.sql.gz')) {
                    return fullPath;
                  }
                }
              } catch (err) {
                log(`Advertencia en búsqueda recursiva de SQL en ${dir}: ${(err as Error).message}`);
              }
              return '';
            };
            sqlFile = findSqlRecursive(destDir);
          }

          if (!sqlFile) {
            throw new Error('No se encontró ningún archivo de volcado de base de datos (.sql o .sql.gz) en el respaldo cargado.');
          }

          log('Paso 8: Importando base de datos MySQL...');
          await this.logStep(migrationId, 'database:restoring', `Importando archivo de base de datos ${path.basename(sqlFile)}...`, 'RUNNING', 65);
          await databaseService.importSQLDump(dbName, sqlFile, mig.detected_project_type);

          if (plugin && typeof plugin.verifyDatabaseReady === 'function') {
            await this.logStep(migrationId, 'database:restoring', 'Esperando que las tablas se importen completamente en MySQL...', 'RUNNING', 68);
            await plugin.verifyDatabaseReady(dbName, docRoot);
          }
          await this.logStep(migrationId, 'database:restoring', 'Base de datos MySQL importada y lista.', 'SUCCESS', 70);
        } else {
          await this.logStep(migrationId, 'database:restoring', 'Omitiendo importación de base de datos MySQL.', 'SUCCESS', 70);
        }

        // Step 9: Detectar dominio original (Rule 4)
        let originalDomain: string | null = null;
        if (plugin && typeof plugin.detectOriginalDomain === 'function') {
          log('Paso 9: Detectando dominio original...');
          originalDomain = await plugin.detectOriginalDomain(containerName, docRoot);
        }

        // Step 10: Ejecutar wp search-replace y cache flush (Rule 7)
        if (mig.detected_project_type === 'WORDPRESS') {
          log('Paso 10: Ejecutando comandos post-migración (WP-CLI)...');
          await this.logStep(migrationId, 'plugin:executing', 'Ejecutando reemplazo de URL y limpieza de caché...', 'RUNNING', 75);

          if (plugin && typeof plugin.ensureWordpressDatabaseConnection === 'function') {
            await plugin.ensureWordpressDatabaseConnection(containerName);
          }
          
          if (originalDomain) {
            const cleanOriginal = originalDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
            const cleanTarget = domain;
            
            log(`Ejecutando wp search-replace de '${cleanOriginal}' a '${cleanTarget}'`);
            
            if (!isDryRun) {
              try {
                execFileSync('docker', ['exec', containerName, 'wp', 'search-replace', cleanOriginal, cleanTarget, '--all-tables', '--allow-root'], { timeout: 120000 });
                execFileSync('docker', ['exec', containerName, 'wp', 'search-replace', `http://${cleanOriginal}`, `https://${cleanTarget}`, '--all-tables', '--allow-root'], { timeout: 120000 });
                execFileSync('docker', ['exec', containerName, 'wp', 'search-replace', `https://${cleanOriginal}`, `https://${cleanTarget}`, '--all-tables', '--allow-root'], { timeout: 120000 });
              } catch (srErr) {
                log(`Advertencia en wp search-replace: ${(srErr as Error).message}`);
              }
            } else {
              log(`[DRY RUN] Simular wp search-replace de ${cleanOriginal} a ${cleanTarget}`);
            }
          } else {
            log('Advertencia: Se omitió wp search-replace porque no se pudo detectar el dominio original.');
          }

          if (!isDryRun) {
            try {
              execFileSync('docker', ['exec', containerName, 'wp', 'cache', 'flush', '--allow-root'], { timeout: 30000 });
            } catch (cfErr) {
              log(`Advertencia en wp cache flush: ${(cfErr as Error).message}`);
            }
          }
        }

        // Step 10.5: Reparación de permisos WordPress (PermissionFixer)
        if (plugin && typeof plugin.fixPermissions === 'function') {
          log('Paso 10.5: Reparando permisos del sitio web...');
          await this.logStep(migrationId, 'plugin:executing', 'Reparando permisos de archivos y carpetas del sitio...', 'RUNNING', 78);
          await plugin.fixPermissions(containerName, siteRoot);
        }

        let commands: string[] = [];
        if (mig.detected_project_type !== 'WORDPRESS' && plugin) {
          commands = await plugin.getMigrationCommands(domain, destDir);
          if (commands.length > 0) {
            log('Ejecutando tareas específicas del framework...');
            for (const cmd of commands) {
              if (!isDryRun) {
                execSync(cmd);
              } else {
                log(`[DRY RUN SIMULATE CMD] ${cmd}`);
              }
            }
          }
        }
        await this.logStep(migrationId, 'plugin:executing', 'Plugins del framework configurados y comandos ejecutados.', 'SUCCESS', 78);

        // Step 11: Configure SSL on Proxy Caddy (80%)
        log('Paso 11: Configurando Caddy/SSL...');
        await this.logStep(migrationId, 'ssl:generating', 'Configurando enrutamiento seguro y recargando Caddy...', 'RUNNING', 80);
        await hostingService.applyCaddyConfig(domain, docRoot, false);
        await sslService.configureSSL(domain);
        await this.logStep(migrationId, 'ssl:generating', 'Enrutamiento SSL Let\'s Encrypt configurado.', 'SUCCESS', 84);

        // Step 12: Mailcow integration (85%)
        log('Paso 12: Integración Mailcow...');
        await this.logStep(migrationId, 'mailcow:restoring', 'Creando dominio y buzones de correo en Mailcow API...', 'RUNNING', 85);
        
        try {
          await mailcowService.createDomain(domain);

          emailDomains = analysisReport?.emails || [];
          const allAccounts: { local_part: string; domain: string; quota: string; messageCount: number; folders: string[] }[] = [];
          for (const emailDomain of emailDomains) {
            if (emailDomain.accounts && Array.isArray(emailDomain.accounts)) {
              for (const acc of emailDomain.accounts) {
                allAccounts.push({
                  local_part: acc.address.split('@')[0],
                  domain: domain,
                  quota: acc.quota || '512',
                  messageCount: acc.messageCount || 0,
                  folders: acc.folders || []
                });
              }
            }
          }

          let totalSourceMessages = 0;
          let totalDestMessages = 0;
          const migrationResults: string[] = [];
          const isDryRunMode = isDryRun;

          for (const acc of allAccounts) {
            const email = `${acc.local_part}@${acc.domain}`;
            const mailboxPass = `Mail_${Math.random().toString(36).substring(2, 10)}!`;
            totalSourceMessages += acc.messageCount;

            try {
              log(`Creando buzón: ${email}`);
              await mailcowService.createMailbox({
                local_part: acc.local_part,
                domain: acc.domain,
                password: mailboxPass,
                quota: 1024,
                name: acc.local_part
              });

              const sourceMaildir = path.join(destDir, 'mail', acc.local_part);
              if (fs.existsSync(sourceMaildir) && !isDryRunMode) {
                try {
                  const checkDovecot = execFileSync('docker', ['ps', '-q', '-f', 'name=dovecot-mailcow']).toString().trim();
                  if (checkDovecot) {
                    const destMaildir = `/var/vmail/${domain}/${acc.local_part}/Maildir/`;
                    execFileSync('docker', ['exec', '-i', 'dovecot-mailcow', 'mkdir', '-p', destMaildir]);
                    execFileSync('docker', ['cp', `${sourceMaildir}/.`, `dovecot-mailcow:${destMaildir}`]);
                    execFileSync('docker', ['exec', '-i', 'dovecot-mailcow', 'chown', '-R', 'vmail:vmail', `/var/vmail/${domain}/${acc.local_part}`]);
                    
                    const findOut = execFileSync('docker', ['exec', '-i', 'dovecot-mailcow', 'find', destMaildir, '-type f'], { stdio: 'pipe' }).toString().trim();
                    const destCount = findOut.split('\n').filter(Boolean).length;
                    totalDestMessages += destCount;
                    migrationResults.push(`${email}: ${destCount} de ${acc.messageCount} mensajes copiados`);
                  } else {
                    throw new Error('Contenedor dovecot-mailcow no encontrado');
                  }
                } catch (rsyncErr) {
                  log(`Error al copiar Maildir para ${email}: ${(rsyncErr as Error).message}`);
                  migrationResults.push(`${email}: ❌ Falló copia de correos`);
                }
              } else {
                migrationResults.push(`${email}: buzón creado (vacío)`);
              }
            } catch (mbErr) {
              log(`Error al crear buzón ${email}: ${(mbErr as Error).message}`);
              if (!isDryRunMode) throw mbErr;
              migrationResults.push(`${email}: ❌ Error al crear buzón`);
            }
          }

          // 4. Provision Email Aliases & Forwarders
          const emailAliases = analysisReport?.aliases || [];
          if (emailAliases.length > 0) {
            log(`Migrando ${emailAliases.length} alias/redirecciones de correo...`);
            for (const alias of emailAliases) {
              try {
                log(`Creando redirección: ${alias.address} -> ${alias.goto}`);
                await mailcowService.createAlias(alias.address, alias.goto);
              } catch (aliasErr) {
                log(`Advertencia al crear redirección ${alias.address}: ${(aliasErr as Error).message}`);
              }
            }
          }

          if (!isDryRunMode && totalSourceMessages > 0 && totalDestMessages === 0) {
            throw new Error('Fallo en migración de correos: IMAP no migrado.');
          }
          await this.logStep(migrationId, 'mailcow:restoring', 'Dominio y buzones de correo configurados en Mailcow.', 'SUCCESS', 90);
        } catch (mailcowErr: any) {
          const isRequired = !!config.mailcow.mailcowRequired;
          log(`Error en la integración con Mailcow: ${mailcowErr.message}`);
          if (isRequired) {
            await this.logStep(migrationId, 'mailcow:restoring', `Fallo crítico en Mailcow: ${mailcowErr.message}`, 'FAILED', 88);
            throw mailcowErr;
          } else {
            log(`[WARNING] Omitiendo fallo en Mailcow ya que MAILCOW_REQUIRED es false.`);
            await this.logStep(migrationId, 'mailcow:restoring', `Advertencia: Integración Mailcow falló (${mailcowErr.message}). Continuando con la migración...`, 'SUCCESS', 90);
          }
        }

        // Step 13: Health Check obligatorio (Rule 8)
        log('Paso 13: Ejecutando Health Check obligatorio...');
        await this.logStep(migrationId, 'verification:running', 'Ejecutando verificaciones de salud y seguridad...', 'RUNNING', 92);
        
        let healthPassed = true;
        if (plugin && typeof plugin.runHealthCheck === 'function') {
          healthPassed = await plugin.runHealthCheck(domain, containerName, docRoot);
        } else {
          const inspectStatus = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', containerName]).toString().trim();
          healthPassed = inspectStatus === 'true';
        }

        if (!healthPassed && !isDryRun) {
          throw new Error('El Health Check obligatorio falló. Revise los contenedores y permisos.');
        }
        await this.logStep(migrationId, 'verification:running', 'Health Check obligatorio aprobado.', 'SUCCESS', 95);

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

        // Register client
        try {
          const existingClient = await query('SELECT * FROM clients WHERE domain = $1', [domain]);
          let clientId = null;
          if (existingClient.rows.length === 0) {
            log(`Registrando automáticamente nuevo cliente para: ${domain}`);
            const clientName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
            let clientEmail = `contacto@${domain}`;
            
            try {
              if (emailDomains[0]?.accounts?.[0]?.address) {
                clientEmail = emailDomains[0].accounts[0].address;
              }
            } catch {}

            const createdClient = await clientService.createClient({
              name: clientName,
              company_name: clientName + ' Sp SpA',
              email: clientEmail,
              domain: domain,
              service_type: 'HOSTING_AND_MAINTENANCE',
              plan_interval: 'MONTHLY',
              amount_per_period: 89000.00,
              currency: 'CLP',
              status: 'ACTIVE',
              last_payment_date: new Date().toISOString().split('T')[0],
              expiration_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
              grace_period_days: 5,
              doc_root: docRoot,
              notes: `Cliente registrado automáticamente el ${new Date().toLocaleDateString('es-CL')}.`
            });
            clientId = createdClient.id;
          } else {
            clientId = existingClient.rows[0].id;
          }

          if (clientId) {
            await query('UPDATE migrations SET client_id = $1 WHERE id = $2', [clientId, migrationId]);
          }
        } catch (clientErr) {
          log(`Error registrando cliente: ${(clientErr as Error).message}`);
        }

        eventBus.emit('migration:completed', { migrationId });
        await storageService.cleanup(destDir);

      } catch (err) {
        const errMsg = (err as Error).message || 'Error desconocido';
        log(`Error crítico en la migración ${migrationId}: ${errMsg}`);
        
        const currentMig = await this.getMigration(migrationId);
        if (currentMig && currentMig.status !== 'FAILED' && currentMig.status !== 'ROLLED_BACK') {
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
          
          try {
            await this.rollbackMigration(migrationId);
          } catch (rollbackErr) {
            log(`Error durante rollback automático: ${(rollbackErr as Error).message}`);
          }
        }
        throw err;
      }
    });
  },

  async logStep(migrationId: string, step: string, message: string, status: 'SUCCESS' | 'FAILED' | 'RUNNING', percentage: number) {
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
        `INSERT INTO migration_logs (migration_id, step, message, status, percentage, started_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [migrationId, step, message, status, percentage, new Date().toISOString()]
      );
    }
    
    await query('UPDATE migrations SET current_step = $1, updated_at = $2 WHERE id = $3', [step, new Date().toISOString(), migrationId]);
    eventBus.emit('migration:step', { migrationId, step, message, status, percentage });
  },

  async rollbackMigration(migrationId: string) {
    if (executedRollbacks.has(migrationId)) {
      log(`Rollback: La migración ${migrationId} ya tiene un proceso de rollback registrado/ejecutado. Omitiendo.`);
      return;
    }
    executedRollbacks.add(migrationId);

    log(`Ejecutando Rollback para la migración: ${migrationId}`);
    
    const mig = await this.getMigration(migrationId);
    if (!mig || mig.status === 'ROLLED_BACK') {
      log(`Rollback: La migración ${migrationId} ya fue revertida o no existe. Omitiendo.`);
      return;
    }

    const domain = mig.domain;
    const rollbackStep = mig.rollback_step;
    const destDir = path.join(config.infrastructure.storagePath, 'migrations', 'extracted', migrationId);

    const keepContainers = process.env.KEEP_FAILED_CONTAINERS === 'true';
    const keepDatabases = process.env.KEEP_FAILED_DATABASES === 'true';

    try {
      if (!keepContainers && rollbackStep === 'REMOVE_CONTAINER') {
        log('Rollback: Eliminando contenedor Docker...');
        try {
          if (domain) {
            await dockerService.removeContainer(domain);
          }
        } catch (err) {
          log(`Advertencia en Rollback: falló eliminar contenedor: ${(err as Error).message}`);
        }
      }
      
      if (!keepDatabases && (rollbackStep === 'REMOVE_CONTAINER' || rollbackStep === 'DROP_DATABASE')) {
        log('Rollback: Eliminando base de datos MySQL...');
        try {
          if (domain) {
            const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
            await databaseService.dropDatabase(dbName);
          }
        } catch (err) {
          log(`Advertencia en Rollback: falló eliminar base de datos: ${(err as Error).message}`);
        }
      }
      
      // Cleanup client database record if auto-created
      try {
        if (!mig.client_id && domain) {
          log('Rollback: Eliminando registro de cliente auto-creado...');
          await query('DELETE FROM clients WHERE domain = $1', [domain]);
        }
      } catch (err) { /* ignore */ }

      // Cleanup target host site directory
      try {
        if (domain) {
          const baseRoot = path.resolve(config.infrastructure.clientSitesPath);
          const targetSiteDir = path.resolve(path.join(baseRoot, domain));
          if (targetSiteDir.startsWith(baseRoot) && targetSiteDir !== baseRoot && domain.includes('.')) {
            if (fs.existsSync(targetSiteDir)) {
              log(`Rollback: Eliminando directorio del sitio verificado: ${targetSiteDir}`);
              await storageService.cleanup(targetSiteDir);
            }
          }
        }
      } catch (dirErr) {
        log(`Advertencia en Rollback: falló limpieza de directorio: ${(dirErr as Error).message}`);
      }

      // Cleanup files
      try {
        if (fs.existsSync(destDir)) {
          await storageService.cleanup(destDir);
        }
      } catch (err) { /* ignore */ }
      
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
