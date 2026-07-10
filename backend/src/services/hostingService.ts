import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { config } from '../config/env';

function isDryRun(): boolean {
  return !!config.migration.dryRun;
}

export const hostingService = {
  generateCaddyConfig(domain: string, docRoot: string, isSuspended: boolean): string {
    if (isSuspended) {
      return `
# Auto-generated Caddy Config for ${domain} [SUSPENDED]
${domain}, www.${domain} {
    root * ${config.caddy.baseDocRoot}
    file_server
    rewrite * /suspended.html
}
`.trim();
    }

    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    return `
# Auto-generated Caddy Config for ${domain} [ACTIVE]
${domain}, www.${domain} {
    root * ${docRoot}
    php_fastcgi ${containerName}:9000
    file_server
    encode gzip
    log {
        output file /var/log/caddy/${domain}.log
    }
}
`.trim();
  },

  async applyCaddyConfig(domain: string, docRoot: string, isSuspended: boolean): Promise<boolean> {
    const fileName = `${domain}.caddy`;
    const configPath = path.join(config.caddy.configDir, fileName);
    const content = this.generateCaddyConfig(domain, docRoot, isSuspended);

    console.log(`[HOSTING ENGINE] Syncing Caddy config for ${domain} (Status: ${isSuspended ? 'SUSPENDED' : 'ACTIVE'})`);

    try {
      // Ensure docRoot exists if not suspended
      if (!fs.existsSync(docRoot) && !isSuspended) {
        fs.mkdirSync(docRoot, { recursive: true });
        fs.writeFileSync(path.join(docRoot, 'index.html'), `<h1>Welcome to ${domain}</h1><p>Hosted by Neokik Digital</p>`);
      }

      if (isDryRun()) {
        console.log(`[HOSTING ENGINE (DRY RUN)] Would write Caddy config for ${domain} to ${configPath}`);
        console.log(`[HOSTING ENGINE (DRY RUN)] Would reload Caddy configuration.`);
        return true;
      }

      // Ensure config directory exists
      if (!fs.existsSync(config.caddy.configDir)) {
        fs.mkdirSync(config.caddy.configDir, { recursive: true });
      }

      fs.writeFileSync(configPath, content, 'utf-8');

      // Reload Caddy
      return new Promise<boolean>((resolve, reject) => {
        exec('docker exec neokik-caddy caddy reload --config /etc/caddy/Caddyfile', (err, stdout, stderr) => {
          if (err) {
            console.warn(`[HOSTING ENGINE WARNING] Caddy reload inside container failed, trying native reload...`);
            exec('caddy reload', (nativeErr, nativeStdout, nativeStderr) => {
              if (nativeErr) {
                console.error(`[HOSTING ENGINE ERROR] Caddy native reload failed: ${nativeStderr || nativeErr.message}`);
                reject(new Error(`Caddy reload failed inside container and natively: ${nativeStderr || nativeErr.message}`));
              } else {
                console.log(`[HOSTING ENGINE] Caddy native reloaded successfully.`);
                resolve(true);
              }
            });
          } else {
            console.log(`[HOSTING ENGINE] Caddy container reloaded successfully.`);
            resolve(true);
          }
        });
      });
    } catch (err) {
      console.error(`[HOSTING ENGINE ERROR] Failed applying Caddy config for ${domain}:`, err);
      throw err; // Propagate error in production
    }
  }
};
