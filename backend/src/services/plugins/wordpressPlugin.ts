import { FrameworkPlugin } from './pluginInterface';
import fs from 'fs';
import path from 'path';

function log(msg: string) {
  console.log(`[WORDPRESS PLUGIN] ${msg}`);
}

export const wordpressPlugin: FrameworkPlugin = {
  name: 'WORDPRESS',

  async onProvision(domain: string, dbConfig: any): Promise<void> {
    log(`Provisionando base de datos WordPress para: ${domain}`);
  },

  async onMigrate(domain: string, extractedPath: string, dbConfig: any): Promise<void> {
    log(`Buscando wp-config.php en respaldo extraído de: ${domain}`);
    
    const wpConfigPaths = [
      path.join(extractedPath, 'wp-config.php'),
      path.join(extractedPath, 'public_html', 'wp-config.php'),
      path.join(extractedPath, 'homedir', 'public_html', 'wp-config.php'),
    ];

    let foundPath = '';
    for (const p of wpConfigPaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (!foundPath) {
      log('wp-config.php no encontrado. Omitiendo reconfiguración automática.');
      return;
    }

    log(`Reconfigurando wp-config.php en ${foundPath}`);
    try {
      let content = fs.readFileSync(foundPath, 'utf-8');
      
      content = content.replace(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"](.*?)['"]\s*\)/, `define('DB_NAME', '${dbConfig.dbName}')`);
      content = content.replace(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"](.*?)['"]\s*\)/, `define('DB_USER', '${dbConfig.dbUser}')`);
      content = content.replace(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"](.*?)['"]\s*\)/, `define('DB_PASSWORD', '${dbConfig.dbPass}')`);
      content = content.replace(/define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"](.*?)['"]\s*\)/, `define('DB_HOST', '${dbConfig.dbHost || 'mysql-container'}')`);
      
      fs.writeFileSync(foundPath, content, 'utf-8');
      log('wp-config.php actualizado con éxito.');
    } catch (err) {
      console.error('[WORDPRESS PLUGIN ERROR] Failed to edit wp-config.php', err);
      throw new Error(`Fallo al editar wp-config.php: ${(err as Error).message}`);
    }
  },

  async onVerify(domain: string): Promise<boolean> {
    return true;
  },

  async getMigrationCommands(domain: string, extractedPath: string): Promise<string[]> {
    log(`Generando comandos de migración post-instalación para WordPress: ${domain}`);
    // Typical commands needed to run inside WP container to complete migration
    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    return [
      `docker exec ${containerName} wp search-replace 'http://antiguo-dominio.cl' 'https://${domain}' --allow-root`,
      `docker exec ${containerName} wp cache flush --allow-root`
    ];
  }
};
