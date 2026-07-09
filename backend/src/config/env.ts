import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: process.env.JWT_SECRET || 'neokik_super_secret_jwt_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // ═══════════════════════════════════════════════════════════════════════
  // DOMINIO DE PLATAFORMA — Cambia SOLO esta línea para cambiar el dominio
  // del negocio en toda la infraestructura (DNS, MX, SSL, Mailcow, etc.)
  // ═══════════════════════════════════════════════════════════════════════
  platformDomain: process.env.PLATFORM_DOMAIN || 'jacvroyz.cl',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'neokik_admin',
    password: process.env.DB_PASSWORD || 'StrongPassword123!',
    database: process.env.DB_NAME || 'neokik_saas',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '"Neokik Digital Support" <support@neokikdigital.com>',
  },
  caddy: {
    configDir: process.env.CADDY_CONFIG_DIR || '/etc/caddy/conf.d',
    baseDocRoot: process.env.BASE_DOC_ROOT || '/var/www/neokik',
    dryRun: process.env.CADDY_DRY_RUN === 'true' || true, // Defaults to dry run for safety if not on real Linux server
  },
  mailcow: {
    apiUrl: process.env.MAILCOW_API_URL || 'http://localhost:8080',
    apiKey: process.env.MAILCOW_API_KEY || 'mailcow-api-key-placeholder',
  },
  infrastructure: {
    uploadsDir: process.env.UPLOADS_DIR || './uploads/migrations',
    maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE || '5368709120', 10), // 5GB
    vpsIP: process.env.VPS_IP || '152.0.0.1',
  },
  server: {
    ip: process.env.SERVER_IP || '0.0.0.0',
    uploadsDir: process.env.UPLOADS_DIR || './uploads',
  },
};
