import { execSync } from 'child_process';
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

export const dockerService = {
  async createContainer(domain: string, projectType: string, phpVersion: string): Promise<any> {
    log(`Creando contenedor Docker (docker-compose) para: ${domain} (PHP: ${phpVersion}, Tipo: ${projectType})`);
    
    if (isDryRun()) {
      return {
        success: true,
        containerId: `doc-mock-${Math.round(Math.random() * 1000000)}`,
        name: domain.replace(/[^a-zA-Z0-9]/g, '_'),
        labels: {
          'caddy.host': domain,
          'caddy.reverse_proxy': '{{upstreams 80}}'
        }
      };
    }

    try {
      const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
      const siteRoot = `${config.infrastructure.clientSitesPath}/${domain}`;
      const docRoot = path.join(siteRoot, 'public_html');
      
      // Ensure site directory and public_html exist
      if (!fs.existsSync(docRoot)) {
        fs.mkdirSync(docRoot, { recursive: true });
      }

      // Generate DB credentials placeholder for docker-compose environment variables list
      const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const dbUser = `user_${domain.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10)}`;
      const dbPass = `Pass_Placeholder123!`;

      // Generate and write docker-compose.yml file
      const composeContent = containerTemplateService.generateDockerComposeFile(domain, projectType, phpVersion, dbName, dbUser, dbPass);
      const composePath = path.join(siteRoot, 'docker-compose.yml');
      fs.writeFileSync(composePath, composeContent, 'utf-8');
      
      // Ensure caddy_proxy network exists
      try {
        execSync('docker network create caddy_proxy', { stdio: 'ignore' });
      } catch {}

      // Spin up using docker-compose
      const cmd = `docker-compose -f "${composePath}" up -d`;
      log(`Ejecutando: ${cmd}`);
      execSync(cmd);

      // Inspect and retrieve container ID
      const containerId = execSync(`docker inspect -f "{{.Id}}" ${containerName}`).toString().trim();
      
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

    try {
      const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
      execSync(`docker stop ${containerName}`);
      return { success: true };
    } catch (err) {
      throw new Error(`Error al detener contenedor: ${(err as Error).message}`);
    }
  },

  async startContainer(domain: string): Promise<any> {
    log(`Iniciando contenedor para: ${domain}`);
    if (isDryRun()) return { success: true };

    try {
      const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
      execSync(`docker start ${containerName}`);
      return { success: true };
    } catch (err) {
      throw new Error(`Error al iniciar contenedor: ${(err as Error).message}`);
    }
  },

  async removeContainer(domain: string): Promise<any> {
    log(`Eliminando contenedor para: ${domain}`);
    if (isDryRun()) return { success: true };

    try {
      const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
      execSync(`docker rm -f ${containerName}`);
      
      // Also clean up docker-compose.yml if exists
      const siteRoot = `${config.infrastructure.clientSitesPath}/${domain}`;
      const composePath = path.join(siteRoot, 'docker-compose.yml');
      if (fs.existsSync(composePath)) {
        try { fs.unlinkSync(composePath); } catch {}
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

    try {
      const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
      const stdout = execSync(`docker stats ${containerName} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}"`).toString().trim();
      const parts = stdout.split('|');
      return {
        cpu_usage: parts[0] || '0%',
        memory_usage: parts[1] || '0MB',
        status: 'running'
      };
    } catch {
      return { status: 'stopped' };
    }
  }
};
