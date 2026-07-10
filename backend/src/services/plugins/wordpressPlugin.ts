import { FrameworkPlugin } from './pluginInterface';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { config } from '../../config/env';

function log(msg: string) {
  console.log(`[WORDPRESS PLUGIN] ${msg}`);
}

export const wordpressPlugin: FrameworkPlugin = {
  name: 'WORDPRESS',

  async onProvision(domain: string, dbConfig: any): Promise<void> {
    log(`Provisionando base de datos WordPress para: ${domain}`);
  },

  async onMigrate(domain: string, extractedPath: string, dbConfig: any): Promise<void> {
    log(`onMigrate triggered for WordPress migration: ${domain}`);
  },

  async onVerify(domain: string): Promise<boolean> {
    return true;
  },

  async getMigrationCommands(domain: string, extractedPath: string): Promise<string[]> {
    return [];
  },

  detectDocumentRoot(dir: string): string {
    log(`Detectando document root real para WordPress en: ${dir}`);
    // Check common directories first
    const commonDirs = [
      path.join(dir, 'homedir', 'public_html'),
      path.join(dir, 'public_html'),
      path.join(dir, 'homedir', 'www'),
      path.join(dir, 'www'),
      path.join(dir, 'htdocs'),
      path.join(dir, 'httpdocs'),
      dir
    ];
    for (const d of commonDirs) {
      if (fs.existsSync(d) && (fs.existsSync(path.join(d, 'wp-config.php')) || fs.existsSync(path.join(d, 'wp-includes')))) {
        log(`Document root detectado en carpeta común: ${d}`);
        return d;
      }
    }

    // Recursive search fallback
    const queue = [dir];
    while (queue.length > 0) {
      const current = queue.shift()!;
      try {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(current, entry.name);
            // Exclude folders we definitely do not want to check
            if (['userdata', 'logs', 'mysql', 'ssl', 'quota', 'ips', 'shadow', 'mail', 'etc', '.git', 'node_modules'].includes(entry.name)) {
              continue;
            }
            if (fs.existsSync(path.join(fullPath, 'wp-config.php')) || fs.existsSync(path.join(fullPath, 'wp-includes'))) {
              log(`Document root detectado mediante búsqueda recursiva: ${fullPath}`);
              return fullPath;
            }
            queue.push(fullPath);
          }
        }
      } catch {}
    }

    log(`No se encontraron indicadores de WordPress. Usando raíz de extracción: ${dir}`);
    return dir;
  },

  async configureDatabaseConfig(docRoot: string, dbConfig: any): Promise<void> {
    log(`Configurando wp-config.php en: ${docRoot}`);
    const wpConfigPath = path.join(docRoot, 'wp-config.php');
    const samplePath = path.join(docRoot, 'wp-config-sample.php');

    if (!fs.existsSync(wpConfigPath)) {
      if (fs.existsSync(samplePath)) {
        log('Generando wp-config.php desde wp-config-sample.php...');
        fs.copyFileSync(samplePath, wpConfigPath);
      } else {
        throw new Error('No se encontró wp-config.php ni wp-config-sample.php en el directorio raíz del sitio.');
      }
    }

    try {
      let content = fs.readFileSync(wpConfigPath, 'utf-8');

      // Helper to update constant value keeping custom config intact
      const updateConstant = (contentStr: string, constant: string, value: string): string => {
        const regex = new RegExp(`(define\\s*\\(\\s*['"]${constant}['"]\\s*,\\s*['"])(.*?)(['"]\\s*\\))`);
        if (regex.test(contentStr)) {
          return contentStr.replace(regex, `$1${value}$3`);
        } else {
          const stopEditingRegex = /(\/\*\s*That's all,\s*stop editing!.*?\*\/)/i;
          if (stopEditingRegex.test(contentStr)) {
            return contentStr.replace(stopEditingRegex, `define('${constant}', '${value}');\n\n$1`);
          }
          return contentStr + `\ndefine('${constant}', '${value}');\n`;
        }
      };

      content = updateConstant(content, 'DB_NAME', dbConfig.dbName);
      content = updateConstant(content, 'DB_USER', dbConfig.dbUser);
      content = updateConstant(content, 'DB_PASSWORD', dbConfig.dbPass);
      const mysqlHost = process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql';
      content = updateConstant(content, 'DB_HOST', mysqlHost);

      fs.writeFileSync(wpConfigPath, content, 'utf-8');
      log('wp-config.php configurado exitosamente.');
    } catch (err) {
      console.error('[WORDPRESS PLUGIN ERROR] Failed to configure wp-config.php', err);
      throw new Error(`Fallo al configurar wp-config.php: ${(err as Error).message}`);
    }
  },

  async detectOriginalDomain(containerName: string, docRoot: string): Promise<string | null> {
    log(`Detectando dominio original de WordPress para contenedor: ${containerName}`);
    
    // 1. Try WP-CLI first
    try {
      const stdout = execSync(`docker exec ${containerName} wp option get siteurl --allow-root`, { timeout: 10000 }).toString().trim();
      if (stdout && stdout.startsWith('http')) {
        log(`Dominio detectado vía WP-CLI: ${stdout}`);
        return stdout;
      }
    } catch (wpCliErr) {
      log(`No se pudo obtener siteurl vía WP-CLI: ${(wpCliErr as Error).message}. Buscando en la base de datos...`);
    }

    // 2. Database fallback: Detect table prefix and query the DB
    try {
      const wpConfigPath = path.join(docRoot, 'wp-config.php');
      if (fs.existsSync(wpConfigPath)) {
        const content = fs.readFileSync(wpConfigPath, 'utf-8');
        const prefixMatch = content.match(/\$table_prefix\s*=\s*['"](.*?)['"]/);
        const prefix = prefixMatch ? prefixMatch[1] : 'wp_';
        
        const dbNameMatch = content.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"](.*?)['"]\s*\)/);
        const dbName = dbNameMatch ? dbNameMatch[1] : '';
        const mysqlHost = process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql';
        const rootPass = config.db.password;

        if (dbName) {
          const queryCmd = `docker exec -i ${mysqlHost} mysql -u root -p${rootPass} ${dbName} -N -e "SELECT option_value FROM ${prefix}options WHERE option_name='siteurl';"`;
          const stdout = execSync(queryCmd, { timeout: 15000 }).toString().trim();
          if (stdout && stdout.startsWith('http')) {
            log(`Dominio detectado vía consulta MySQL: ${stdout}`);
            return stdout;
          }
        }
      }
    } catch (dbErr) {
      log(`Error al consultar la base de datos para siteurl: ${(dbErr as Error).message}`);
    }

    log('Advertencia: No se pudo determinar el dominio original.');
    return null;
  },

  async runHealthCheck(domain: string, containerName: string, docRoot: string): Promise<boolean> {
    log(`Ejecutando Health Check obligatorio para ${domain}...`);
    try {
      // 1. Contenedor Running
      const inspectStatus = execSync(`docker inspect -f "{{.State.Running}}" ${containerName}`).toString().trim();
      if (inspectStatus !== 'true') {
        log('HEALTH CHECK FAILED: El contenedor no está corriendo.');
        return false;
      }

      // 2. PHP-FPM operativo & WP-CLI funcional
      const wpInfo = execSync(`docker exec ${containerName} wp --info --allow-root`).toString().trim();
      if (!wpInfo.includes('PHP version') && !wpInfo.includes('WP-CLI')) {
        log('HEALTH CHECK FAILED: WP-CLI o PHP-FPM no responden.');
        return false;
      }

      // 3. Connection MySQL válida & wp core is-installed
      try {
        execSync(`docker exec ${containerName} wp core is-installed --allow-root`, { stdio: 'ignore' });
      } catch (err) {
        log('HEALTH CHECK FAILED: WordPress no está reportando como instalado (core is-installed falló).');
        return false;
      }

      // 4. Tablas WordPress presentes
      const wpConfigPath = path.join(docRoot, 'wp-config.php');
      if (fs.existsSync(wpConfigPath)) {
        const content = fs.readFileSync(wpConfigPath, 'utf-8');
        const prefixMatch = content.match(/\$table_prefix\s*=\s*['"](.*?)['"]/);
        const prefix = prefixMatch ? prefixMatch[1] : 'wp_';
        const dbNameMatch = content.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"](.*?)['"]\s*\)/);
        const dbName = dbNameMatch ? dbNameMatch[1] : '';
        const mysqlHost = process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql';
        const rootPass = config.db.password;

        if (dbName) {
          const checkCmd = `docker exec -i ${mysqlHost} mysql -u root -p${rootPass} ${dbName} -N -e "SHOW TABLES LIKE '${prefix}options';"`;
          const tableExists = execSync(checkCmd).toString().trim();
          if (!tableExists) {
            log('HEALTH CHECK FAILED: No se encontraron las tablas básicas de WordPress.');
            return false;
          }
        }
      }

      // 5. Sitio responde correctamente (HTTP check)
      try {
        const httpCode = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Host: ${domain}" http://localhost/`, { timeout: 5000 }).toString().trim();
        log(`Respuesta HTTP local para ${domain}: ${httpCode}`);
        const codeNum = parseInt(httpCode, 10);
        if (codeNum === 502 || codeNum === 503 || codeNum === 504 || codeNum === 0 || isNaN(codeNum)) {
          log(`HEALTH CHECK FAILED: La respuesta HTTP del sitio es ${httpCode}`);
          return false;
        }
      } catch (curlErr) {
        log(`Advertencia en HTTP check: ${(curlErr as Error).message}`);
      }

      log('HEALTH CHECK SUCCESS: Todas las validaciones pasaron exitosamente.');
      return true;
    } catch (err) {
      log(`HEALTH CHECK EXCEPTION: ${(err as Error).message}`);
      return false;
    }
  }
};
