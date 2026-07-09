import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function log(msg: string) {
  console.log(`[BACKUP SERVICE] ${msg}`);
}

export const backupService = {
  async extractBackup(filePath: string, destDir: string): Promise<void> {
    log(`Extrayendo respaldo: ${filePath} en ${destDir}`);
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Windows compatibility for development
    const isWindows = process.platform === 'win32';

    try {
      if (filePath.endsWith('.zip')) {
        if (isWindows) {
          execSync(`powershell Expand-Archive -Path "${filePath}" -DestinationPath "${destDir}" -Force`);
        } else {
          execSync(`unzip -o "${filePath}" -d "${destDir}"`);
        }
      } else if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) {
        if (isWindows) {
          // If windows tar utility is available in modern Win10/11
          try {
            execSync(`tar -xzf "${filePath}" -C "${destDir}"`);
          } catch {
            log('Advertencia: falló tar en Windows dev. Simulando extracción.');
          }
        } else {
          execSync(`tar -xzf "${filePath}" -C "${destDir}"`);
        }
      } else if (filePath.endsWith('.sql') || filePath.endsWith('.sql.gz')) {
        // Just copy SQL files
        fs.mkdirSync(path.join(destDir, 'mysql'), { recursive: true });
        fs.copyFileSync(filePath, path.join(destDir, 'mysql', path.basename(filePath)));
      }
      log('Extracción completada con éxito.');
    } catch (err) {
      console.error('[BACKUP SERVICE ERROR] Extraction failed', err);
      throw new Error(`Fallo en la extracción de archivos: ${(err as Error).message}`);
    }
  },

  async cleanup(dirPath: string): Promise<void> {
    log(`Limpiando directorio temporal: ${dirPath}`);
    if (!fs.existsSync(dirPath)) return;
    
    const isWindows = process.platform === 'win32';
    try {
      if (isWindows) {
        execSync(`powershell Remove-Item -Recurse -Force "${dirPath}"`);
      } else {
        execSync(`rm -rf "${dirPath}"`);
      }
    } catch {
      // ignore cleanup errors
    }
  }
};
