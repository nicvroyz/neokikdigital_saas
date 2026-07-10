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

  generateDockerComposeFile(domain: string, projectType: string, phpVersion: string, dbName: string, dbUser: string, dbPass: string): string {
    log(`Generando docker-compose.yml para: ${domain} (Tipo: ${projectType})`);
    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    const image = projectType === 'WORDPRESS' ? 'neokik-wordpress:latest' : `php:${phpVersion}-fpm-alpine`;
    const mysqlContainer = process.env.MYSQL_CONTAINER_NAME || 'neokik-mysql';

    return `
version: '3.8'

services:
  app:
    container_name: ${containerName}
    image: ${image}
    restart: unless-stopped
    volumes:
      - ./public_html:/var/www/html
    networks:
      - caddy_proxy
      - neokikdigital_saas_default
    environment:
      - WORDPRESS_DB_HOST=${mysqlContainer}
      - WORDPRESS_DB_NAME=${dbName}
      - WORDPRESS_DB_USER=${dbUser}
      - WORDPRESS_DB_PASSWORD=${dbPass}
    labels:
      - "caddy=${domain}"
      - "caddy.root=*/var/www/html"
      - "caddy.php_fastcgi={{upstreams 9000}}"
      - "caddy.file_server="

networks:
  caddy_proxy:
    external: true
    name: caddy_proxy
  neokikdigital_saas_default:
    external: true
    name: neokikdigital_saas_default
`.trim();
  }
};
