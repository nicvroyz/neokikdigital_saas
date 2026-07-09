import { execSync } from 'child_process';
import { config } from '../config/env';

function isDryRun(): boolean {
  return !!config.caddy.dryRun;
}

function log(msg: string) {
  console.log(`[DATABASE SERVICE] ${msg}`);
}

export const databaseService = {
  async createDatabase(dbName: string, dbUser: string, dbPass: string): Promise<any> {
    log(`Creando Base de Datos: ${dbName} y usuario: ${dbUser}`);
    
    if (isDryRun()) {
      return { success: true, dbName, dbUser };
    }

    try {
      // Create DB and user in containerized MySQL
      const mysqlContainer = 'mysql-container'; // assumed running MySQL container name
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

  async importSQLDump(dbName: string, dumpFilePath: string): Promise<any> {
    log(`Importando SQL dump: ${dumpFilePath} en base de datos: ${dbName}`);
    
    if (isDryRun()) {
      return { success: true };
    }

    try {
      const mysqlContainer = 'mysql-container';
      const rootPass = config.db.password;
      
      // Import the SQL dump directly into the container database
      const cmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} ${dbName} < ${dumpFilePath}`;
      execSync(cmd);
      
      return { success: true };
    } catch (err) {
      console.error('[DATABASE SERVICE ERROR] Failed to import SQL', err);
      throw new Error(`Error al importar SQL dump: ${(err as Error).message}`);
    }
  },

  async dropDatabase(dbName: string): Promise<any> {
    log(`Eliminando base de datos: ${dbName}`);
    if (isDryRun()) return { success: true };

    try {
      const mysqlContainer = 'mysql-container';
      const rootPass = config.db.password;
      const cmd = `docker exec -i ${mysqlContainer} mysql -u root -p${rootPass} -e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`;"`;
      execSync(cmd);
      return { success: true };
    } catch (err) {
      throw new Error(`Error al eliminar base de datos: ${(err as Error).message}`);
    }
  }
};
