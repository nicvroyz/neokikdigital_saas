import { config } from '../config/env';

// Decoupled secret service to isolate credentials access
// Can be replaced in the future with HashiCorp Vault, AWS Secrets Manager, or Docker Secrets
export const secretService = {
  getMailcowApiKey(): string {
    return config.mailcow.apiKey || process.env.MAILCOW_API_KEY || 'mailcow-api-key-placeholder';
  },

  getMailcowApiUrl(): string {
    return config.mailcow.apiUrl || process.env.MAILCOW_API_URL || `https://mail.${config.platformDomain}`;
  },

  getDatabaseRootPassword(): string {
    return config.db.password || process.env.DB_PASSWORD || 'root_db_password_placeholder';
  },

  getSecret(key: string): string {
    // General fallback lookup
    return process.env[key] || '';
  }
};
