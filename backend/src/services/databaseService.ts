import { execSync } from 'child_process';
import { config } from '../config/env';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';

function isDryRun(): boolean {
  return !!config.migration.dryRun;
}

function log(msg: string) {
  console.log(`[DATABASE SERVICE] ${msg}`);
}

async function sanitizeSQLDump(srcPath: string, destPath: string): Promise<void> {
  const readStream = fs.createReadStream(srcPath);
  const writeStream = fs.createWriteStream(destPath);
  
  const rl = readline.createInterface({
    input: readStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    // 1. Remove CREATE USER, GRANT, REVOKE, DROP USER commands
    if (/^\s*(CREATE USER|GRANT|REVOKE|DROP USER)\s+/i.test(trimmed)) {
      continue;
    }
    // 2. Remove USE database_name; and CREATE DATABASE commands
    if (/^\s*(USE|CREATE DATABASE)\s+/i.test(trimmed)) {
      continue;
    }
    // 3. Remove DEFINER statements: e.g. /*!50013 DEFINER=`user`@`host` SQL SECURITY DEFINER */
    let cleanLine = line;
    if (line.includes('DEFINER=')) {
      cleanLine = line.replace(/DEFINER\s*=\s*[`"']?[a-zA-Z0-9_-]+[`"']?@[`"']?[a-zA-Z0-9_*%-]+[`"']?/gi, '');
    }
    
    writeStream.write(cleanLine + '\n');
  }
  
  writeStream.end();
}

export const databaseService = {
  async createDatabase(dbName: string, dbUser: string, dbPass: string): Promise<any> {
    log(`Creando Base de Datos: ${dbName} y usuario: ${dbUser}`);
    
    if (isDryRun()) {
      return { success: true, dbName, dbUser };
    }

    try {
      const mysqlContainer = process.env.MYSQL_CONTAINER_NAME;
      if (!mysqlContainer) {
        throw new Error('Falta configurar la variable de entorno MYSQL_CONTAINER_NAME para el contenedor MySQL/MariaDB.');
      }
      const rootPass = config.db.password; // root password
      
      const sqlCommands = `
        CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}';
        GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'%';
        FLUSH PRIVILEGES;
      `;
      
      const cmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} -e "${sqlCommands}"`;
      execSync(cmd);
      
      return { success: true, dbName, dbUser };
    } catch (err) {
      console.error('[DATABASE SERVICE ERROR] Failed to create database', err);
      throw new Error(`Error en DatabaseService: ${(err as Error).message}`);
    }
  },

  async importSQLDump(dbName: string, dumpFilePath: string, projectType?: string): Promise<any> {
    log(`Importando SQL dump: ${dumpFilePath} en base de datos: ${dbName}`);
    
    if (isDryRun()) {
      return { success: true };
    }

    const mysqlContainer = process.env.MYSQL_CONTAINER_NAME;
    if (!mysqlContainer) {
      throw new Error('Falta configurar la variable de entorno MYSQL_CONTAINER_NAME para el contenedor MySQL/MariaDB.');
    }
    const rootPass = config.db.password;

    // 1. Pre-Import Backup
    let dbExists = false;
    let tablesCount = 0;
    
    try {
      const checkDbCmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} -e "SHOW DATABASES LIKE '${dbName}';"`;
      const dbResult = execSync(checkDbCmd, { stdio: 'pipe' }).toString().trim();
      dbExists = dbResult.toLowerCase().includes(dbName.toLowerCase());
      
      if (dbExists) {
        const checkTablesCmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} ${dbName} -N -e "SHOW TABLES;"`;
        const tablesResult = execSync(checkTablesCmd, { stdio: 'pipe' }).toString().trim();
        tablesCount = tablesResult.split('\n').filter(Boolean).length;
      }
    } catch (err) {
      log(`No se pudo verificar la existencia previa de la base de datos: ${(err as Error).message}`);
    }

    if (dbExists && tablesCount > 0) {
      log(`Se detectó una base de datos existente con ${tablesCount} tablas. Creando copia de seguridad...`);
      const backupsDir = config.infrastructure.backupPath || '/srv/neokik/backups';
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const backupFile = path.join(backupsDir, `before-import-${dbName}-${Date.now()}.sql`);
      try {
        const dumpCmd = `docker exec -i ${mysqlContainer} mysqldump -u root -p${rootPass} ${dbName} > "${backupFile}"`;
        execSync(dumpCmd);
        log(`Copia de seguridad creada exitosamente en: ${backupFile}`);
      } catch (dumpErr) {
        log(`Advertencia: Falló la creación de la copia de seguridad. Detalle: ${(dumpErr as Error).message}`);
      }
    }

    let activeSqlPath = dumpFilePath;
    let decompressedPath = '';
    let sanitizedPath = '';

    try {
      // 2. Decompress if gzipped
      if (dumpFilePath.endsWith('.gz')) {
        decompressedPath = dumpFilePath + '.decompressed';
        log(`Descomprimiendo archivo SQL gzip: ${dumpFilePath}`);
        const gzip = zlib.createGunzip();
        const source = fs.createReadStream(dumpFilePath);
        const destination = fs.createWriteStream(decompressedPath);
        
        await new Promise<void>((resolve, reject) => {
          source.pipe(gzip).pipe(destination).on('finish', resolve).on('error', reject);
        });
        activeSqlPath = decompressedPath;
      }

      // 3. Sanitize SQL dump
      sanitizedPath = activeSqlPath + '.sanitized';
      log(`Sanitizando volcado SQL: ${activeSqlPath}`);
      await sanitizeSQLDump(activeSqlPath, sanitizedPath);

      // 4. Import the sanitized SQL dump
      const cmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} ${dbName} < "${sanitizedPath}"`;
      execSync(cmd);
      
      log(`Validando importación para la base de datos: ${dbName}...`);
      const checkCmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} ${dbName} -e "SHOW TABLES;"`;
      const stdout = execSync(checkCmd).toString().trim();
      
      const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) { // SHOW TABLES outputs a header line, so length <= 1 means 0 tables!
        throw new Error('La base de datos importada no contiene tablas.');
      }

      // If it's a WordPress migration, look for wp_* tables (case-insensitive)
      if (projectType === 'WORDPRESS') {
        const hasWpTables = lines.some(line => line.toLowerCase().includes('_options'));
        if (!hasWpTables) {
          throw new Error("No se encontraron tablas de WordPress (wp_*) en la base de datos importada.");
        }
      }
      
      log('Validación de base de datos completada exitosamente.');
      return { success: true };
    } catch (err) {
      console.error('[DATABASE SERVICE ERROR] Failed to import SQL', err);
      throw new Error(`Error al importar SQL dump: ${(err as Error).message}`);
    } finally {
      // Clean up temp files
      if (decompressedPath && fs.existsSync(decompressedPath)) {
        try { fs.unlinkSync(decompressedPath); } catch {}
      }
      if (sanitizedPath && fs.existsSync(sanitizedPath)) {
        try { fs.unlinkSync(sanitizedPath); } catch {}
      }
    }
  },

  async dropDatabase(dbName: string): Promise<any> {
    log(`Eliminando base de datos: ${dbName}`);
    if (isDryRun()) return { success: true };

    try {
      const mysqlContainer = process.env.MYSQL_CONTAINER_NAME;
      if (!mysqlContainer) {
        throw new Error('Falta configurar la variable de entorno MYSQL_CONTAINER_NAME para el contenedor MySQL/MariaDB.');
      }
      const rootPass = config.db.password;
      const cmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} -e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`;"`;
      execSync(cmd);
      return { success: true };
    } catch (err) {
      throw new Error(`Error al eliminar base de datos: ${(err as Error).message}`);
    }
  }
};
