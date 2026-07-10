import { FrameworkPlugin } from './pluginInterface';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { config } from '../../config/env';

function log(msg: string) {
  console.log(`[WORDPRESS PLUGIN] ${msg}`);
}

async function getOrDetectTablePrefix(docRoot: string, dbName: string): Promise<string> {
  // 1. Try wp-config.php in docRoot
  const wpConfigPath = path.join(docRoot, 'wp-config.php');
  if (fs.existsSync(wpConfigPath)) {
    try {
      const content = fs.readFileSync(wpConfigPath, 'utf-8');
      const prefixMatch = content.match(/\$table_prefix\s*=\s*['"](.*?)['"]/);
      if (prefixMatch && prefixMatch[1]) {
        log(`Prefijo detectado desde wp-config.php: "${prefixMatch[1]}"`);
        return prefixMatch[1];
      }
    } catch (err) {
      log(`Error leyendo prefix desde wp-config.php: ${(err as Error).message}`);
    }
  }

  // 2. Try meta/dbprefix file
  const dbPrefixFile = path.join(docRoot, 'meta', 'dbprefix');
  if (fs.existsSync(dbPrefixFile)) {
    try {
      const prefix = fs.readFileSync(dbPrefixFile, 'utf-8').trim();
      if (prefix) {
        log(`Prefijo detectado desde meta/dbprefix: "${prefix}"`);
        return prefix;
      }
    } catch (err) {}
  }

  // 3. Try querying the database SHOW TABLES LIKE '%_options'
  try {
    const mysqlHost = process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql';
    const rootPass = config.db.password;
    if (dbName) {
      const queryCmd = `docker exec -i ${mysqlHost} mysql -u root -p${rootPass} ${dbName} -N -e "SHOW TABLES LIKE '%_options';"`;
      const output = execSync(queryCmd, { timeout: 10000 }).toString().trim().split('\n')[0].trim();
      if (output && output.endsWith('_options')) {
        const prefix = output.substring(0, output.length - 'options'.length);
        log(`Prefijo detectado desde SHOW TABLES: "${prefix}" (tabla encontrada: "${output}")`);
        return prefix;
      }
    }
  } catch (err) {
    log(`Error ejecutando SHOW TABLES para prefijo. Base: "${dbName}". Detalle: ${(err as Error).message}`);
  }

  log(`No se pudo detectar el prefijo. Usando valor por defecto: "wp_"`);
  return 'wp_';
}

async function ensureWordpressDatabaseConnection(containerName: string): Promise<void> {
  log(`Verificando conectividad de WordPress con su base de datos...`);
  const maxRetries = 15; // 30 seconds max
  const intervalMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(`docker exec ${containerName} wp core is-installed --allow-root`, { timeout: 5000, stdio: 'pipe' });
      log(`Conexión con la base de datos confirmada mediante wp core is-installed en el intento ${attempt}.`);
      return;
    } catch (err: any) {
      const stdout = err.stdout ? err.stdout.toString().trim() : '';
      const stderr = err.stderr ? err.stderr.toString().trim() : (err.message || '');
      log(`Intento ${attempt}/${maxRetries} - Conexión de base de datos no lista aún. Stdout: "${stdout}", Stderr: "${stderr}"`);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout: WordPress no pudo establecer conexión con la base de datos en el contenedor ${containerName}.`);
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
        const regex1 = new RegExp(`(define\\s*\\(\\s*['"]${constant}['"]\\s*,\\s*['"])(.*?)(['"]\\s*\\))`);
        if (regex1.test(contentStr)) {
          return contentStr.replace(regex1, `$1${value}$3`);
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

      // Disable forced SSL database connection flags from cPanel migrations to allow standard docker network connections
      content = content.replace(/define\s*\(\s*['"]MYSQL_CLIENT_FLAGS['"]\s*,\s*[\s\S]*?\)/gi, "define('MYSQL_CLIENT_FLAGS', 0)");
      content = content.replace(/define\s*\(\s*['"]MYSQL_SSL['"]\s*,\s*[\s\S]*?\)/gi, "define('MYSQL_SSL', false)");

      fs.writeFileSync(wpConfigPath, content, 'utf-8');
      log('wp-config.php configurado exitosamente.');
    } catch (err) {
      console.error('[WORDPRESS PLUGIN ERROR] Failed to configure wp-config.php', err);
      throw new Error(`Fallo al configurar wp-config.php: ${(err as Error).message}`);
    }
  },

  async verifyDatabaseReady(dbName: string, docRoot: string): Promise<void> {
    log(`Verificando que la base de datos ${dbName} esté lista e importada...`);
    const mysqlHost = process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql';
    const rootPass = config.db.password;
    const maxRetries = 15; // 30 seconds max
    const intervalMs = 2000;
    let prefix = 'wp_';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        prefix = await getOrDetectTablePrefix(docRoot, dbName);
        const targetTable = `${prefix}options`;
        
        const queryCmd = `docker exec -i ${mysqlHost} mysql -u root -p${rootPass} ${dbName} -N -e "SELECT COUNT(*) FROM ${targetTable};"`;
        const countStr = execSync(queryCmd, { timeout: 5000, stdio: 'pipe' }).toString().trim();
        const count = parseInt(countStr, 10);
        
        if (!isNaN(count) && count > 0) {
          log(`Base de datos lista. Se encontraron ${count} registros en la tabla ${targetTable} en el intento ${attempt}.`);
          return;
        }
      } catch (err: any) {
        log(`Intento ${attempt}/${maxRetries} - Esperando tablas/registros: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    // Try a general check of tables count as fallback
    try {
      const checkTablesCmd = `docker exec -i ${mysqlHost} mysql -u root -p${rootPass} ${dbName} -N -e "SHOW TABLES;"`;
      const tables = execSync(checkTablesCmd, { timeout: 5000 }).toString().trim();
      if (tables.length > 0) {
        log(`Advertencia: No se encontró la tabla de opciones ${prefix}options, pero existen tablas en la base de datos ${dbName}.`);
        return;
      }
    } catch {}

    throw new Error(`Timeout al esperar importación de base de datos. Base: "${dbName}", Prefijo detectado/asumido: "${prefix}", Tabla buscada: "${prefix}options".`);
  },

  async ensureWordpressDatabaseConnection(containerName: string): Promise<void> {
    await ensureWordpressDatabaseConnection(containerName);
  },

  async fixPermissions(containerName: string, siteRoot: string): Promise<void> {
    log(`Reparando permisos de archivos de WordPress para el contenedor: ${containerName} (Directorio: ${siteRoot})`);
    
    if (!!config.migration.dryRun) {
      log('[DRY RUN] Omitiendo reparación de permisos en modo simulación.');
      return;
    }

    try {
      // 1. Detect UID inside the container
      let uid = '82'; // Default Alpine www-data UID
      let gid = '82'; // Default Alpine www-data GID
      
      try {
        const uidStr = execSync(`docker exec ${containerName} id -u www-data`, { timeout: 5000, stdio: 'pipe' }).toString().trim();
        if (uidStr && !isNaN(parseInt(uidStr, 10))) {
          uid = uidStr;
        }
      } catch (err) {
        log(`Advertencia al detectar UID del contenedor: ${(err as Error).message}. Usando valor por defecto: ${uid}`);
      }

      try {
        const gidStr = execSync(`docker exec ${containerName} id -g www-data`, { timeout: 5000, stdio: 'pipe' }).toString().trim();
        if (gidStr && !isNaN(parseInt(gidStr, 10))) {
          gid = gidStr;
        }
      } catch (err) {
        log(`Advertencia al detectar GID del contenedor: ${(err as Error).message}. Usando valor por defecto: ${gid}`);
      }

      log(`UID detectado: ${uid}, GID detectado: ${gid}`);

      const publicHtmlPath = path.join(siteRoot, 'public_html');
      if (!fs.existsSync(publicHtmlPath)) {
        log(`Advertencia: El directorio ${publicHtmlPath} no existe. No se pueden reparar permisos.`);
        return;
      }

      // 2. chown -R on host
      log(`Ejecutando chown -R ${uid}:${gid} en ${publicHtmlPath}...`);
      execSync(`chown -R ${uid}:${gid} "${publicHtmlPath}"`, { timeout: 30000 });

      // 3. chmod 755 (directories) and 644 (files) on host
      log('Aplicando chmod 755 a directorios y 644 a archivos...');
      execSync(`find "${publicHtmlPath}" -type d -exec chmod 755 {} +`, { timeout: 30000 });
      execSync(`find "${publicHtmlPath}" -type f -exec chmod 644 {} +`, { timeout: 30000 });

      // 4. Ensure writable subdirectories (wp-content, uploads, cache, upgrade, plugins) have 775/664
      const writableDirs = [
        path.join(publicHtmlPath, 'wp-content'),
        path.join(publicHtmlPath, 'wp-content', 'uploads'),
        path.join(publicHtmlPath, 'wp-content', 'cache'),
        path.join(publicHtmlPath, 'wp-content', 'upgrade'),
        path.join(publicHtmlPath, 'wp-content', 'plugins')
      ];

      for (const dirPath of writableDirs) {
        if (!fs.existsSync(dirPath)) {
          try {
            fs.mkdirSync(dirPath, { recursive: true });
            execSync(`chown ${uid}:${gid} "${dirPath}"`);
          } catch {}
        }
        if (fs.existsSync(dirPath)) {
          try {
            execSync(`chmod 775 "${dirPath}"`);
            execSync(`find "${dirPath}" -type d -exec chmod 775 {} +`, { timeout: 15000 });
            execSync(`find "${dirPath}" -type f -exec chmod 664 {} +`, { timeout: 15000 });
          } catch (chmodErr) {
            log(`Advertencia ajustando permisos de escritura en ${dirPath}: ${(chmodErr as Error).message}`);
          }
        }
      }

      log('Permisos reparados exitosamente.');
    } catch (err) {
      console.error('[WORDPRESS PLUGIN ERROR] Failed to fix permissions', err);
      throw new Error(`Fallo al reparar permisos de WordPress: ${(err as Error).message}`);
    }
  },

  async detectOriginalDomain(containerName: string, docRoot: string): Promise<string | null> {
    log(`Detectando dominio original de WordPress para contenedor: ${containerName}`);
    
    const dbName = `db_${containerName}`;
    const prefix = await getOrDetectTablePrefix(docRoot, dbName);

    // 1. Try WP-CLI first (Only if core is-installed passes)
    try {
      await ensureWordpressDatabaseConnection(containerName);
      
      const stdout = execSync(`docker exec ${containerName} wp option get siteurl --allow-root`, { timeout: 10000 }).toString().trim();
      if (stdout && stdout.startsWith('http')) {
        log(`Dominio original detectado vía WP-CLI: ${stdout}`);
        return stdout;
      }
    } catch (wpCliErr: any) {
      const cmd = `docker exec ${containerName} wp option get siteurl --allow-root`;
      const stdout = wpCliErr.stdout ? wpCliErr.stdout.toString().trim() : '';
      const stderr = wpCliErr.stderr ? wpCliErr.stderr.toString().trim() : (wpCliErr.message || '');
      const status = wpCliErr.status !== undefined ? wpCliErr.status : -1;
      
      log(`No se pudo obtener siteurl vía WP-CLI. Comando: "${cmd}", Status: ${status}, Stdout: "${stdout}", Stderr: "${stderr}". Buscando en la base de datos...`);
    }

    // 2. Database fallback: Query siteurl and home option
    const mysqlHost = process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql';
    const rootPass = config.db.password;
    const targetTable = `${prefix}options`;

    try {
      const queryCmd = `docker exec -i ${mysqlHost} mysql -u root -p${rootPass} ${dbName} -N -e "SELECT option_value FROM ${targetTable} WHERE option_name='siteurl';"`;
      const stdout = execSync(queryCmd, { timeout: 15000 }).toString().trim();
      if (stdout && stdout.startsWith('http')) {
        log(`Dominio original detectado vía MySQL (siteurl): ${stdout}`);
        return stdout;
      }
    } catch (dbErr: any) {
      log(`Fallo al consultar siteurl en base de datos. Base: "${dbName}", Prefijo: "${prefix}", Tabla: "${targetTable}". Detalle: ${dbErr.message}`);
    }

    try {
      const queryCmd = `docker exec -i ${mysqlHost} mysql -u root -p${rootPass} ${dbName} -N -e "SELECT option_value FROM ${targetTable} WHERE option_name='home';"`;
      const stdout = execSync(queryCmd, { timeout: 15000 }).toString().trim();
      if (stdout && stdout.startsWith('http')) {
        log(`Dominio original detectado vía MySQL (home): ${stdout}`);
        return stdout;
      }
    } catch (dbErr: any) {
      log(`Fallo al consultar home en base de datos. Base: "${dbName}", Prefijo: "${prefix}", Tabla: "${targetTable}". Detalle: ${dbErr.message}`);
    }

    log('Advertencia: No se pudo determinar el dominio original.');
    return null;
  },

  async runHealthCheck(domain: string, containerName: string, docRoot: string): Promise<boolean> {
    log(`Ejecutando Health Check obligatorio para ${domain}...`);
    const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const prefix = await getOrDetectTablePrefix(docRoot, dbName);

    try {
      // 1. Contenedor Running
      const inspectStatus = execSync(`docker inspect -f "{{.State.Running}}" ${containerName}`).toString().trim();
      if (inspectStatus !== 'true') {
        log('HEALTH CHECK FAILED: El contenedor no está corriendo.');
        return false;
      }

      // 2. Validar PHP responde
      try {
        const phpInfo = execSync(`docker exec ${containerName} php -v`, { stdio: 'pipe' }).toString().trim();
        log(`HEALTH CHECK: PHP funcionando en contenedor (${phpInfo.split('\n')[0]})`);
      } catch (err: any) {
        const stdout = err.stdout ? err.stdout.toString().trim() : '';
        const stderr = err.stderr ? err.stderr.toString().trim() : (err.message || '');
        log(`HEALTH CHECK FAILED: PHP no responde en contenedor. Status: ${err.status}, Stdout: "${stdout}", Stderr: "${stderr}"`);
        return false;
      }

      // 3. Validar WordPress conecta a DB (wp option get siteurl)
      try {
        const siteUrl = execSync(`docker exec ${containerName} wp option get siteurl --allow-root`, { stdio: 'pipe' }).toString().trim();
        log(`HEALTH CHECK: Conexión a Base de Datos validada. siteurl resuelve a: "${siteUrl}"`);
      } catch (err: any) {
        const stdout = err.stdout ? err.stdout.toString().trim() : '';
        const stderr = err.stderr ? err.stderr.toString().trim() : (err.message || '');
        log(`HEALTH CHECK FAILED: WordPress no puede conectarse a la Base de Datos. Status: ${err.status}, Stdout: "${stdout}", Stderr: "${stderr}"`);
        return false;
      }

      // 4. Validar permisos de escritura en uploads
      try {
        execSync(`docker exec ${containerName} touch /var/www/html/wp-content/uploads/.healthcheck`, { stdio: 'pipe' });
        execSync(`docker exec ${containerName} rm -f /var/www/html/wp-content/uploads/.healthcheck`, { stdio: 'pipe' });
        log('HEALTH CHECK: Permisos de escritura validados exitosamente en wp-content/uploads.');
      } catch (err: any) {
        const stdout = err.stdout ? err.stdout.toString().trim() : '';
        const stderr = err.stderr ? err.stderr.toString().trim() : (err.message || '');
        log(`HEALTH CHECK FAILED: No hay permisos de escritura en wp-content/uploads. Status: ${err.status}, Stdout: "${stdout}", Stderr: "${stderr}"`);
        return false;
      }

      // 5. Validar respuesta HTTP local/remota
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
