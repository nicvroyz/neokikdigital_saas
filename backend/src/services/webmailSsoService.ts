import crypto from 'crypto';
import { config } from '../config/env';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const webmailSsoService = {
  isConfigured(): boolean {
    return !!config.webmailSso.secret;
  },

  // Signs a short-lived, single-use token the Mailcow-side bridge (infra/mailcow/sogo-auth.php)
  // verifies via HMAC-SHA256 before granting a passwordless SOGo session for `email`.
  // Plain HMAC instead of a JWT library on purpose: the bridge is one PHP file with no
  // dependencies, and a fixed HMAC scheme avoids JWT "alg" negotiation footguns entirely.
  generateToken(email: string, clientId: string, adminId: string | undefined): { token: string; url: string } {
    if (!this.isConfigured()) {
      throw new Error('WEBMAIL_SSO_SECRET no está configurado');
    }

    const payload = {
      email,
      client_id: clientId,
      admin_id: adminId || null,
      exp: Math.floor(Date.now() / 1000) + config.webmailSso.tokenTtlSeconds,
      jti: crypto.randomBytes(16).toString('hex'),
    };

    const payloadB64 = base64url(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', config.webmailSso.secret).update(payloadB64).digest('hex');
    const token = `${payloadB64}.${signature}`;

    const base = config.mailcow.webmailUrl.replace(/\/$/, '');
    const url = `${base}/sogo-auth.php?neokik_token=${encodeURIComponent(token)}`;

    return { token, url };
  },
};
