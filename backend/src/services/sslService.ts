import { execSync } from 'child_process';
import { config } from '../config/env';

function isDryRun(): boolean {
  return !!config.caddy.dryRun;
}

function log(msg: string) {
  console.log(`[SSL SERVICE] ${msg}`);
}

export const sslService = {
  async configureSSL(domain: string): Promise<any> {
    log(`Configurando enrutamiento seguro SSL (Proxy Caddy) para: ${domain}`);
    
    if (isDryRun()) {
      return {
        success: true,
        issuer: "Let's Encrypt",
        ssl_enabled: true
      };
    }

    try {
      // In production, we trigger Caddy to reload configuration
      // Assuming Caddy container is running with name 'caddy-proxy'
      const cmd = `docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile`;
      log(`Ejecutando: ${cmd}`);
      execSync(cmd);
      
      return {
        success: true,
        issuer: "Let's Encrypt",
        ssl_enabled: true
      };
    } catch (err) {
      console.error('[SSL SERVICE ERROR] Failed to reload proxy configuration', err);
      throw new Error(`Error en SSLService: ${(err as Error).message}`);
    }
  },

  async renewSSL(domain: string): Promise<any> {
    log(`Solicitando renovación forzada de SSL para: ${domain}`);
    if (isDryRun()) return { success: true };

    try {
      // Caddy handles automatic renewal, but we can force it or check status
      execSync(`docker exec caddy-proxy caddy reload`);
      return { success: true };
    } catch (err) {
      throw new Error(`Error al renovar SSL: ${(err as Error).message}`);
    }
  }
};
