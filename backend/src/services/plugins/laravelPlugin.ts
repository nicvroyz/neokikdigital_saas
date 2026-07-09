import { FrameworkPlugin } from './pluginInterface';
import fs from 'fs';
import path from 'path';

function log(msg: string) {
  console.log(`[LARAVEL PLUGIN] ${msg}`);
}

export const laravelPlugin: FrameworkPlugin = {
  name: 'LARAVEL',

  async onProvision(domain: string, dbConfig: any): Promise<void> {
    log(`Provisionando base de datos Laravel para: ${domain}`);
  },

  async onMigrate(domain: string, extractedPath: string, dbConfig: any): Promise<void> {
    log(`Buscando archivo .env de Laravel en: ${domain}`);
    
    const envPaths = [
      path.join(extractedPath, '.env'),
      path.join(extractedPath, 'public_html', '.env'),
      path.join(extractedPath, 'homedir', 'public_html', '.env'),
    ];

    let foundPath = '';
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (!foundPath) {
      log('.env no encontrado. Creando a partir de .env.example si existe.');
      const examplePath = foundPath.replace('.env', '.env.example');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, foundPath);
        foundPath = examplePath.replace('.env.example', '.env');
      } else {
        return;
      }
    }

    log(`Reconfigurando .env en ${foundPath}`);
    try {
      let content = fs.readFileSync(foundPath, 'utf-8');
      
      content = content.replace(/DB_DATABASE=.*/g, `DB_DATABASE=${dbConfig.dbName}`);
      content = content.replace(/DB_USERNAME=.*/g, `DB_USERNAME=${dbConfig.dbUser}`);
      content = content.replace(/DB_PASSWORD=.*/g, `DB_PASSWORD=${dbConfig.dbPass}`);
      content = content.replace(/DB_HOST=.*/g, `DB_HOST=${dbConfig.dbHost || 'mysql-container'}`);
      
      fs.writeFileSync(foundPath, content, 'utf-8');
      log('.env de Laravel reconfigurado.');
    } catch (err) {
      console.error('[LARAVEL PLUGIN ERROR] Failed to edit .env', err);
      throw new Error(`Fallo al editar .env: ${(err as Error).message}`);
    }
  },

  async onVerify(domain: string): Promise<boolean> {
    return true;
  },

  async getMigrationCommands(domain: string, extractedPath: string): Promise<string[]> {
    log(`Generando comandos de migración post-instalación para Laravel: ${domain}`);
    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    return [
      `docker exec ${containerName} composer install --no-dev --optimize-autoloader`,
      `docker exec ${containerName} php artisan migrate --force`,
      `docker exec ${containerName} php artisan storage:link`,
      `docker exec ${containerName} php artisan config:cache`
    ];
  }
};
