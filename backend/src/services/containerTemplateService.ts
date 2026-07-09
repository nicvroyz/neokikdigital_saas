import { config } from '../config/env';

function log(msg: string) {
  console.log(`[CONTAINER TEMPLATE] ${msg}`);
}

export const containerTemplateService = {
  generateCaddyfileSnippet(domain: string, containerName: string, port = 80): string {
    log(`Generando bloque Caddyfile para: ${domain} -> ${containerName}:${port}`);
    return `
${domain} {
    reverse_proxy ${containerName}:${port}
    encode gzip
    log {
        output file /var/log/caddy/${domain}.log
    }
}
    `.trim();
  },

  generateDockerRunCommand(domain: string, projectType: string, phpVersion: string): string {
    log(`Generando docker run para: ${domain}`);
    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    const docRoot = `${config.caddy.baseDocRoot}/sites/${domain}`;
    
    // Connected to Caddy central proxy network
    return `docker run -d \\
      --name ${containerName} \\
      --network caddy_proxy \\
      --restart unless-stopped \\
      -v ${docRoot}:/var/www/html \\
      -l "caddy=${domain}" \\
      -l "caddy.reverse_proxy={{upstreams 80}}" \\
      php:${phpVersion}-fpm-alpine`.trim();
  }
};
