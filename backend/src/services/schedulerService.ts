import cron from 'node-cron';
import { sslService } from './sslService';
import { dnsAnalyzerService } from './dnsAnalyzerService';
import { monitoringService } from './monitoringService';
import { config } from '../config/env';

function log(msg: string) {
  console.log(`[SCHEDULER SERVICE] ${msg}`);
}

export const schedulerService = {
  init(): void {
    log('Inicializando tareas programadas (Scheduler)...');

    // 1. SSL Automatic renewal check (Every day at midnight)
    cron.schedule('0 0 * * *', async () => {
      log('Ejecutando tarea programada: comprobación de renovación SSL...');
      try {
        // SSL Service handles check and reload for proxy automatically
        await sslService.renewSSL('*');
      } catch (err) {
        console.error('[SCHEDULER ERROR] Failed to run SSL check', err);
      }
    });

    // 2. Monitoring & Diagnostics metrics (Every 10 minutes)
    cron.schedule('*/10 * * * *', async () => {
      log('Ejecutando tarea programada: medición de métricas del servidor...');
      try {
        await monitoringService.measureDiagnostics();
      } catch (err) {
        console.error('[SCHEDULER ERROR] Failed to collect diagnostics', err);
      }
    });

    // 3. DNS Verification checks (Every 4 hours)
    cron.schedule('0 */4 * * *', async () => {
      log('Ejecutando tarea programada: verificación periódica de DNS...');
      try {
        // Perform standard DNS check on a sample client or log metrics
        await dnsAnalyzerService.analyzeDomain(config.platformDomain, '152.0.0.1');
      } catch (err) {
        console.error('[SCHEDULER ERROR] Failed to verify DNS', err);
      }
    });

    log('Tareas programadas registradas con éxito.');
  }
};
