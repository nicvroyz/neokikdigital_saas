import { execFileSync } from 'child_process';
import { config } from '../config/env';
import { containerTemplateService } from './containerTemplateService';
import fs from 'fs';
import path from 'path';

function isDryRun(): boolean {
  return !!config.migration.dryRun;
}

function log(msg: string) {
  console.log(`[DOCKER SERVICE] ${msg}`);
}

function validateShellSafe(...inputs: string[]) {
  const safeRegex = /^[a-zA-Z0-9_.-]+$/;
  for (const input of inputs) {
    if (!input || !safeRegex.test(input)) {
      throw new Error(`Entrada no segura detectada para ejecución shell: "${input}"`);
    }
  }
}

export const dockerService = {
  async createContainer(
    domain: string,
    projectType: string,
    phpVersion: string,
    dbName?: string,
    dbUser?: string,
    dbPass?: string
  ): Promise<any> {
    log(`Creando contenedor Docker (docker-compose) para: ${domain} (PHP: ${phpVersion}, Tipo: ${projectType})`);

    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');

    if (isDryRun()) {
      return {
        success: true,
        containerId: `doc-mock-${Math.round(Math.random() * 1000000)}`,
        name: containerName,
        labels: {
          'caddy.host': domain,
          'caddy.reverse_proxy': '{{upstreams 80}}'
        }
      };
    }

    if (!dbName || !dbUser || !dbPass) {
      throw new Error('Faltan credenciales de base de datos requeridas (dbName, dbUser, dbPass) en dockerService.');
    }

    validateShellSafe(domain, containerName, dbName, dbUser);

    log(`Configuración del contenedor: name=${containerName}, DB_HOST=${process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql'}, DB_NAME=${dbName}, DB_USER=${dbUser}, DB_PASSWORD=********`);

    try {
      const siteRoot = `${config.infrastructure.clientSitesPath}/${domain}`;
      const docRoot = path.join(siteRoot, 'public_html');
      
      // Ensure site directory and public_html exist
      if (!fs.existsSync(docRoot)) {
        fs.mkdirSync(docRoot, { recursive: true });
      }

      // Generate and write .env file for database credentials
      const envContent = [
        `WORDPRESS_DB_HOST=${process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql'}`,
        `WORDPRESS_DB_NAME=${dbName}`,
        `WORDPRESS_DB_USER=${dbUser}`,
        `WORDPRESS_DB_PASSWORD=${dbPass}`,
        `MYSQL_DATABASE=${dbName}`,
        `MYSQL_USER=${dbUser}`,
        `MYSQL_PASSWORD=${dbPass}`
      ].join('\n');
      const envPath = path.join(siteRoot, '.env');
      fs.writeFileSync(envPath, envContent, 'utf-8');

      // Generate and write docker-compose.yml file (with inherited env vars)
      const composeContent = containerTemplateService.generateDockerComposeFile(domain, projectType, phpVersion);
      const composePath = path.join(siteRoot, 'docker-compose.yml');
      fs.writeFileSync(composePath, composeContent, 'utf-8');
      
      // Ensure caddy_proxy network exists (using execFileSync to bypass shell)
      try {
        execFileSync('docker', ['network', 'create', 'caddy_proxy'], { stdio: 'ignore' });
      } catch {}

      // Spin up using docker-compose (using execFileSync to bypass shell)
      log(`Ejecutando: docker-compose -f "${composePath}" up -d`);
      execFileSync('docker-compose', ['-f', composePath, 'up', '-d']);

      // Inspect and retrieve container ID (using execFileSync to bypass shell)
      const containerId = execFileSync('docker', ['inspect', '-f', '{{.Id}}', containerName]).toString().trim();
      
      return {
        success: true,
        containerId: containerId,
        name: containerName
      };
    } catch (err) {
      console.error('[DOCKER SERVICE ERROR] Error creating container', err);
      throw new Error(`Error en DockerService: ${(err as Error).message}`);
    }
  },

  async stopContainer(domain: string): Promise<any> {
    log(`Deteniendo contenedor para: ${domain}`);
    if (isDryRun()) return { success: true };

    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    validateShellSafe(domain, containerName);

    try {
      execFileSync('docker', ['stop', containerName]);
      return { success: true };
    } catch (err) {
      throw new Error(`Error al detener contenedor: ${(err as Error).message}`);
    }
  },

  async startContainer(domain: string): Promise<any> {
    log(`Iniciando contenedor para: ${domain}`);
    if (isDryRun()) return { success: true };

    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    validateShellSafe(domain, containerName);

    try {
      execFileSync('docker', ['start', containerName]);
      return { success: true };
    } catch (err) {
      throw new Error(`Error al iniciar contenedor: ${(err as Error).message}`);
    }
  },

  async removeContainer(domain: string): Promise<any> {
    log(`Eliminando contenedor para: ${domain}`);
    if (isDryRun()) return { success: true };

    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    validateShellSafe(domain, containerName);

    try {
      execFileSync('docker', ['rm', '-f', containerName]);
      
      // Clean up files in site root
      const siteRoot = `${config.infrastructure.clientSitesPath}/${domain}`;
      const composePath = path.join(siteRoot, 'docker-compose.yml');
      const envPath = path.join(siteRoot, '.env');
      if (fs.existsSync(composePath)) {
        try { fs.unlinkSync(composePath); } catch {}
      }
      if (fs.existsSync(envPath)) {
        try { fs.unlinkSync(envPath); } catch {}
      }
      
      return { success: true };
    } catch (err) {
      throw new Error(`Error al eliminar contenedor: ${(err as Error).message}`);
    }
  },

  async getContainerStats(domain: string): Promise<any> {
    if (isDryRun()) {
      return {
        cpu_usage: '1.2%',
        memory_usage: '45MB',
        status: 'running'
      };
    }

    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    validateShellSafe(domain, containerName);

    try {
      const stdout = execFileSync('docker', ['stats', containerName, '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}']).toString().trim();
      const parts = stdout.split('|');
      return {
        cpu_usage: parts[0] || '0%',
        memory_usage: parts[1] || '0MB',
        status: 'running'
      };
    } catch {
      return { status: 'stopped' };
    }
  },

  async waitForContainerReady(containerName: string, isWordpress = true, timeoutMs = 60000): Promise<void> {
    log(`Esperando a que el contenedor ${containerName} esté listo y operativo (WordPress: ${isWordpress}, timeout: ${timeoutMs}ms)...`);
    
    if (isDryRun()) return;

    validateShellSafe(containerName);

    const startTime = Date.now();
    const intervalMs = 3000;
    let isContainerRunning = false;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const inspect = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', containerName], { stdio: 'pipe' }).toString().trim();
        if (inspect === 'true') {
          isContainerRunning = true;
          if (isWordpress) {
            try {
              const dbCheck = execFileSync('docker', ['exec', containerName, 'wp', 'db', 'check', '--allow-root'], { timeout: 5000, stdio: 'pipe' }).toString().trim();
              if (dbCheck.toLowerCase().includes('success')) {
                log(`Contenedor WordPress ${containerName} está completamente operativo.`);
                return;
              }
            } catch (dbErr) {
              log(`Contenedor activo pero WP DB check falló: ${(dbErr as Error).message}`);
            }
          } else {
            // General PHP check
            try {
              const info = execFileSync('docker', ['exec', containerName, 'php', '-v'], { timeout: 3000, stdio: 'pipe' }).toString().trim();
              if (info.includes('PHP')) {
                log(`Contenedor PHP ${containerName} está operativo.`);
                return;
              }
            } catch (phpErr) {
              log(`Contenedor activo pero la validación PHP falló: ${(phpErr as Error).message}`);
            }
          }
        } else {
          log(`Contenedor ${containerName} no se está ejecutando actualmente.`);
        }
      } catch (err) {
        log(`Error al inspeccionar el contenedor ${containerName}: ${(err as Error).message}`);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    if (!isContainerRunning) {
      throw new Error(`Timeout: El contenedor ${containerName} nunca inició.`);
    } else {
      throw new Error(`Timeout: El contenedor ${containerName} está iniciado pero no responde a los comandos internos o falló la conexión a la base de datos.`);
    }
  }
};
