import { execSync } from 'child_process';
import { config } from '../config/env';

function isDryRun(): boolean {
  return !!config.migration.dryRun;
}

function log(msg: string): void {
  console.log(`[SSL SERVICE] ${msg}`);
}

const CADDY_CONTAINER = 'neokik-caddy';
const CADDY_CONFIG = '/etc/caddy/Caddyfile';
const CADDY_RELOAD_CMD = `docker exec ${CADDY_CONTAINER} caddy reload --config ${CADDY_CONFIG}`;

export const sslService = {
  async configureSSL(domain: string): Promise<any> {
    log(`Configurando SSL para: ${domain}`);

    if (isDryRun()) {
      log('[DRY RUN] Configuración SSL simulada.');
      return {
        success: true,
        issuer: "Let's Encrypt",
        ssl_enabled: true,
      };
    }

    try {
      log(`Recargando Caddy: ${CADDY_RELOAD_CMD}`);

      execSync(CADDY_RELOAD_CMD, {
        stdio: 'inherit',
      });

      return {
        success: true,
        issuer: "Let's Encrypt",
        ssl_enabled: true,
      };
    } catch (err) {
      console.error('[SSL SERVICE ERROR] Error al recargar Caddy', err);
      throw new Error(`Error al configurar SSL: ${(err as Error).message}`);
    }
  },

  async renewSSL(domain: string): Promise<any> {
    log(`Solicitando renovación SSL para: ${domain}`);

    if (isDryRun()) {
      log('[DRY RUN] Renovación SSL simulada.');
      return {
        success: true,
      };
    }

    try {
      log(`Recargando Caddy: ${CADDY_RELOAD_CMD}`);

      execSync(CADDY_RELOAD_CMD, {
        stdio: 'inherit',
      });

      return {
        success: true,
      };
    } catch (err) {
      console.error('[SSL SERVICE ERROR] Error al renovar SSL', err);
      throw new Error(`Error al renovar SSL: ${(err as Error).message}`);
    }
  },
};