import { execSync } from 'child_process';
import { config } from '../config/env';
import { containerTemplateService } from './containerTemplateService';

function isDryRun(): boolean {
  return !!config.caddy.dryRun;
}

function log(msg: string) {
  console.log(`[DOCKER SERVICE] ${msg}`);
}

export const dockerService = {
  async createContainer(domain: string, projectType: string, phpVersion: string): Promise<any> {
    log(`Creando contenedor Docker para: ${domain} (PHP: ${phpVersion}, Tipo: ${projectType})`);
    
    if (isDryRun()) {
      return {
        success: true,
        containerId: `doc-mock-${Math.round(Math.random() * 1000000)}`,
        name: domain,
        labels: {
          'caddy.host': domain,
          'caddy.reverse_proxy': '{{upstreams 80}}'
        }
      };
    }

    try {
      const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
      const cmd = containerTemplateService.generateDockerRunCommand(domain, projectType, phpVersion);
      
      log(`Ejecutando: ${cmd}`);
      const stdout = execSync(cmd).toString().trim();
      
      return {
        success: true,
        containerId: stdout,
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
