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

  generateDockerComposeFile(domain: string, projectType: string, phpVersion: string): string {
    log(`Generando docker-compose.yml para: ${domain} (Tipo: ${projectType})`);
    const containerName = domain.replace(/[^a-zA-Z0-9]/g, '_');
    const image = projectType === 'WORDPRESS' ? 'neokik-wordpress:latest' : `php:${phpVersion}-fpm-alpine`;

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
      WORDPRESS_DB_HOST: \${WORDPRESS_DB_HOST}
      WORDPRESS_DB_NAME: \${WORDPRESS_DB_NAME}
      WORDPRESS_DB_USER: \${WORDPRESS_DB_USER}
      WORDPRESS_DB_PASSWORD: \${WORDPRESS_DB_PASSWORD}
      MYSQL_DATABASE: \${MYSQL_DATABASE}
      MYSQL_USER: \${MYSQL_USER}
      MYSQL_PASSWORD: \${MYSQL_PASSWORD}
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
