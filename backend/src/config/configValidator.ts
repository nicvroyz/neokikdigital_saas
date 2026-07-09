import { config } from './env';

export const validateConfig = (): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  const missingVars: string[] = [];

  // Check critical variables
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'neokik_super_secret_jwt_key_2026') {
    if (isProduction) {
      missingVars.push('JWT_SECRET (Debe ser una clave única y segura en producción)');
    }
  }

  if (isProduction) {
    if (!process.env.DB_HOST) missingVars.push('DB_HOST');
    if (!process.env.DB_USER) missingVars.push('DB_USER');
    if (!process.env.DB_PASSWORD) missingVars.push('DB_PASSWORD');
    if (!process.env.DB_NAME) missingVars.push('DB_NAME');

    if (!process.env.MAILCOW_API_KEY || process.env.MAILCOW_API_KEY === 'mailcow-api-key-placeholder') {
      missingVars.push('MAILCOW_API_KEY (Debe configurarse la API Key de Mailcow en producción)');
    }
  }

  // Warn about important variables that have fallbacks but should be verified
  if (!process.env.PLATFORM_DOMAIN) {
    console.warn('[WARNING] [CONFIG] PLATFORM_DOMAIN no está definida en .env. Se usará el valor por defecto: ' + config.platformDomain);
  }

  if (missingVars.length > 0) {
    console.error('================================================================');
    console.error('❌ ERROR FATAL: Faltan variables de entorno requeridas para el arranque:');
    missingVars.forEach(v => console.error(`  - ${v}`));
    console.error('El servidor no puede iniciar sin estas configuraciones.');
    console.error('================================================================');
    process.exit(1);
  } else {
    console.log('[CONFIG] variables de entorno verificadas con éxito.');
  }
};
