import fs from 'fs';
import path from 'path';
import { exec, execFileSync } from 'child_process';
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
    php_fastcgi ${containerName}:9000 {
        root /var/www/html
    }
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
        console.log(`[HOSTING ENGINE (DRY RUN)] Would validate and reload Caddy configuration.`);
        return true;
      }

      // Ensure config directory exists
      if (!fs.existsSync(config.caddy.configDir)) {
        fs.mkdirSync(config.caddy.configDir, { recursive: true });
      }

      fs.writeFileSync(configPath, content, 'utf-8');

      // Requirement 6: Después de generar un archivo .caddy, verificar que exista, no esté vacío y tenga permisos de lectura
      if (!fs.existsSync(configPath)) {
        throw new Error(`El archivo de configuración de Caddy no existe en la ruta: ${configPath}`);
      }
      const fileStats = fs.statSync(configPath);
      if (fileStats.size === 0) {
        throw new Error(`El archivo de configuración de Caddy en la ruta ${configPath} está vacío.`);
      }
      try {
        fs.accessSync(configPath, fs.constants.R_OK);
      } catch (accessErr) {
        throw new Error(`El archivo de configuración de Caddy en la ruta ${configPath} no tiene permisos de lectura: ${(accessErr as Error).message}`);
      }

      // Requirement 7 & 8: Validar configuración de Caddy antes de recargar
      try {
        execFileSync('docker', ['exec', 'neokik-caddy', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile'], { stdio: 'pipe' });
        console.log(`[HOSTING ENGINE] Caddyfile validado exitosamente.`);
      } catch (valErr: any) {
        const stdout = valErr.stdout ? valErr.stdout.toString().trim() : '';
        const stderr = valErr.stderr ? valErr.stderr.toString().trim() : (valErr.message || '');
        console.error(`[HOSTING ENGINE ERROR] La validación de Caddy falló. Stdout: "${stdout}", Stderr: "${stderr}"`);
        throw new Error(`La validación de Caddy falló. No se aplicará el reload. Detalle: ${stderr || valErr.message}`);
      }

      // Requirement 8: Ejecutar reload si validate fue exitoso
      try {
        execFileSync('docker', ['exec', 'neokik-caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'], { stdio: 'pipe' });
        console.log(`[HOSTING ENGINE] Caddy recargado exitosamente.`);
      } catch (relErr: any) {
        const stderr = relErr.stderr ? relErr.stderr.toString().trim() : (relErr.message || '');
        console.error(`[HOSTING ENGINE ERROR] El reload de Caddy falló. Stderr: "${stderr}"`);
        throw new Error(`El reload de Caddy falló. Detalle: ${stderr || relErr.message}`);
      }

      // Requirement 9: Después del reload verificar existencia, lectura y activación
      try {
        // Verificar existencia en /etc/caddy/sites del contenedor
        execFileSync('docker', ['exec', 'neokik-caddy', 'test', '-f', `/etc/caddy/sites/${fileName}`]);
      } catch (err) {
        throw new Error(`Verificación fallida: El archivo ${fileName} no existe en /etc/caddy/sites dentro del contenedor Caddy.`);
      }

      try {
        // Verificar permisos de lectura en /etc/caddy/sites del contenedor
        execFileSync('docker', ['exec', 'neokik-caddy', 'test', '-r', `/etc/caddy/sites/${fileName}`]);
      } catch (err) {
        throw new Error(`Verificación fallida: El archivo ${fileName} en /etc/caddy/sites dentro del contenedor Caddy no tiene permisos de lectura.`);
      }

      try {
        // Verificar que la configuración haya quedado activa consultando el API de Caddy
        let configActiveJson = '';
        try {
          configActiveJson = execFileSync('docker', ['exec', 'neokik-caddy', 'wget', '-qO-', 'http://localhost:2019/config/'], { stdio: 'pipe' }).toString();
        } catch (wgetErr) {
          try {
            configActiveJson = execFileSync('docker', ['exec', 'neokik-caddy', 'curl', '-s', 'http://localhost:2019/config/'], { stdio: 'pipe' }).toString();
          } catch (curlErr) {
            console.warn(`[HOSTING ENGINE WARNING] No se pudo consultar la API de Caddy vía wget ni curl.`);
          }
        }

        if (configActiveJson && !configActiveJson.includes(domain)) {
          throw new Error(`El dominio ${domain} no se encuentra cargado en la configuración activa del servidor Caddy.`);
        }
      } catch (actErr: any) {
        throw new Error(`Verificación de activación fallida: ${actErr.message}`);
      }

      return true;
    } catch (err) {
      console.error(`[HOSTING ENGINE ERROR] Failed applying Caddy config for ${domain}:`, err);
      throw err; // Propagate error in production to abort migration
    }
  }
};
