import { query } from '../config/db';
import { queueService, JobRecord } from './queueService';
import { migrationService } from './migrationService';
import { provisioningService } from './provisioningService';
import { eventBus } from './eventBus';

let workerActive = false;
let workerInterval: NodeJS.Timeout | null = null;

function log(msg: string) {
  console.log(`[WORKER PROCESSOR] ${msg}`);
}

async function insertAuditLog(action: string, entity: string, clientId: string | null, metadata: any, status: 'SUCCESS' | 'FAILED' | 'WARNING') {
  try {
    await query(
      `INSERT INTO audit_logs (id, user_id, client_id, action, entity, old_value, new_value, metadata, status, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `audit-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        null, // user_id (null for automated background processor actions)
        clientId,
        action,
        entity,
        JSON.stringify({}),
        JSON.stringify({}),
        JSON.stringify(metadata),
        status,
        '127.0.0.1'
      ]
    );
  } catch (err) {
    console.error('[WORKER PROCESSOR AUDIT ERROR] Failed to write audit log', err);
  }
}

export const workerProcessor = {
  async start(force = false) {
    if (workerActive && !force) return;
    workerActive = true;
    log('Iniciando Procesador de Trabajos (Worker)...');

    // 1. Recover crashed jobs (PROCESSING status on server crash)
    try {
      const crashed = await queueService.getCrashedJobs();
      for (const job of crashed) {
        log(`Recuperando trabajo colapsado: ${job.id}`);
        await queueService.updateJobStatus(job.id, 'FAILED', 'Trabajo interrumpido por caída de servidor.');
        
        await insertAuditLog(
          'MIGRATION_INTERRUPTED_CRASH',
          'MIGRATION',
          null,
          { jobId: job.id, referenceId: job.reference_id, error: 'Server crash recovery' },
          'FAILED'
        );

        if (job.job_type === 'MIGRATION') {
          await migrationService.rollbackMigration(job.reference_id);
        }
      }
    } catch (err) {
      console.error('[WORKER PROCESSOR ERROR] Crash recovery failed', err);
    }

    // 2. Main execution loop
    workerInterval = setInterval(async () => {
      try {
        const job = await queueService.getNextPendingJob();
        if (!job) return;

        log(`Procesando trabajo: ${job.job_type} (${job.id})`);
        
        // Increment attempts & set to PROCESSING
        await queueService.incrementAttempts(job.id, job.attempts);

        const startTime = Date.now();

        try {
          if (job.job_type === 'MIGRATION') {
            await insertAuditLog(
              'MIGRATION_START',
              'MIGRATION',
              null,
              { jobId: job.id, migrationId: job.reference_id, attempts: job.attempts + 1 },
              'SUCCESS'
            );
            
            await migrationService.executeMigration(job.reference_id);
          } else if (job.job_type === 'PROVISION') {
            await insertAuditLog(
              'PROVISION_START',
              'PROVISION',
              null,
              { jobId: job.id, provisionId: job.reference_id, attempts: job.attempts + 1 },
              'SUCCESS'
            );

            await provisioningService.executeProvision(job.reference_id);
          }

          // Mark job as COMPLETED
          await queueService.updateJobStatus(job.id, 'COMPLETED');
          
          const duration = Math.round((Date.now() - startTime) / 1000);
          await insertAuditLog(
            job.job_type === 'MIGRATION' ? 'MIGRATION_SUCCESS' : 'PROVISION_SUCCESS',
            job.job_type,
            null,
            { jobId: job.id, duration_seconds: duration, attempts: job.attempts + 1 },
            'SUCCESS'
          );

          log(`Trabajo finalizado con éxito: ${job.id}`);
        } catch (execErr) {
          const errMsg = (execErr as Error).message || 'Error desconocido';
          const duration = Math.round((Date.now() - startTime) / 1000);

          log(`Fallo en el trabajo ${job.id}: ${errMsg}`);

          // Retry logic
          const nextAttempt = job.attempts + 1;
          if (nextAttempt < job.max_attempts) {
            log(`Reintentando trabajo ${job.id} (Intento ${nextAttempt + 1} de ${job.max_attempts})...`);
            await queueService.updateJobStatus(job.id, 'PENDING', errMsg);
            
            await insertAuditLog(
              job.job_type === 'MIGRATION' ? 'MIGRATION_RETRY' : 'PROVISION_RETRY',
              job.job_type,
              null,
              { jobId: job.id, error: errMsg, attempt: nextAttempt, duration_seconds: duration },
              'WARNING'
            );
          } else {
            // Out of attempts, set to FAILED and run rollback
            await queueService.updateJobStatus(job.id, 'FAILED', errMsg);
            
            await insertAuditLog(
              job.job_type === 'MIGRATION' ? 'MIGRATION_FAILED' : 'PROVISION_FAILED',
              job.job_type,
              null,
              { jobId: job.id, error: errMsg, duration_seconds: duration, attempts: nextAttempt },
              'FAILED'
            );

            if (job.job_type === 'MIGRATION') {
              log(`Iniciando rollback automático para la migración: ${job.reference_id}`);
              await migrationService.rollbackMigration(job.reference_id);
            }
          }
        }
      } catch (err) {
        console.error('[WORKER PROCESSOR ERROR] Loop execution failed', err);
      }
    }, 3000);
  },

  stop() {
    if (workerInterval) {
      clearInterval(workerInterval);
      workerInterval = null;
      workerActive = false;
      log('Procesador de Trabajos detenido.');
    }
  }
};
