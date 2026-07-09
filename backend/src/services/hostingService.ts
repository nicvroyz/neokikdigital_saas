import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { config } from '../config/env';

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
    reverse_proxy ${containerName}:80
    encode gzip
    log {
        output file /var/log/caddy/${domain}.log
    }
}
`.trim();
  },

  async applyCaddyConfig(domain: string, docRoot: string, isSuspended: boolean) {
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

      // Write config if configuration folder exists
      if (fs.existsSync(config.caddy.configDir)) {
        fs.writeFileSync(configPath, content, 'utf-8');
        
        // Reload Caddy container (or native systemctl reload)
        const isDryRun = !!config.caddy.dryRun;
        if (!isDryRun) {
          exec('docker exec neokik-caddy caddy reload --config /etc/caddy/Caddyfile', (err, stdout, stderr) => {
            if (err) {
              console.warn(`[HOSTING ENGINE WARNING] Caddy reload inside container failed, trying native reload...`);
              exec('caddy reload', (nativeErr, nativeStdout, nativeStderr) => {
                if (nativeErr) {
                  console.error(`[HOSTING ENGINE ERROR] Caddy native reload failed: ${nativeStderr}`);
                } else {
                  console.log(`[HOSTING ENGINE] Caddy native reloaded successfully.`);
                }
              });
            } else {
              console.log(`[HOSTING ENGINE] Caddy container reloaded successfully.`);
            }
          });
        } else {
          console.log(`[HOSTING ENGINE (DRY RUN)] Would reload Caddy configuration.`);
        }
      } else {
        console.log(`[HOSTING ENGINE (DRY RUN)] Would write Caddy config for ${domain} to ${configPath}`);
      }
      return true;
    } catch (err) {
      console.error(`[HOSTING ENGINE ERROR] Failed applying Caddy config for ${domain}:`, err);
      return false;
    }
  }
};
