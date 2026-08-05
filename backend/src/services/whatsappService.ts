import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket
} from '@whiskeysockets/baileys';

export interface WhatsAppStatus {
  connected: boolean;
  status: 'DISCONNECTED' | 'QR_READY' | 'CONNECTED';
  qrCodeUrl?: string;
  phoneNumber?: string;
}

// Session store directory - Baileys persists auth credentials here so the
// linked session survives backend restarts without re-scanning the QR.
const SESSION_DIR = path.join(__dirname, '../../whatsapp_session');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function log(msg: string) {
  console.log(`[WHATSAPP] ${msg}`);
}

let sock: WASocket | null = null;
let connecting = false;

let connectionStatus: WhatsAppStatus = {
  connected: false,
  status: 'DISCONNECTED'
};

async function connect(): Promise<void> {
  if (connecting) return;
  connecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          connectionStatus = { connected: false, status: 'QR_READY', qrCodeUrl: qrDataUrl };
          log('Nuevo código QR generado. Escanéalo desde el panel para vincular la sesión.');
        } catch (err) {
          log(`Error generando imagen QR: ${(err as Error).message}`);
        }
      }

      if (connection === 'open') {
        const rawId = sock?.user?.id || '';
        const rawNumber = rawId.split(':')[0] || rawId.split('@')[0];
        connectionStatus = {
          connected: true,
          status: 'CONNECTED',
          phoneNumber: rawNumber ? `+${rawNumber}` : undefined
        };
        log(`Sesión vinculada exitosamente. Número: ${connectionStatus.phoneNumber || 'desconocido'}`);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        connecting = false;

        if (loggedOut) {
          log('Sesión cerrada desde el teléfono. Se requiere un nuevo código QR.');
          connectionStatus = { connected: false, status: 'DISCONNECTED' };
          try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            fs.mkdirSync(SESSION_DIR, { recursive: true });
          } catch (err) {
            log(`Error limpiando sesión previa: ${(err as Error).message}`);
          }
        } else {
          log(`Conexión perdida (código: ${statusCode ?? 'desconocido'}). Reintentando...`);
          connectionStatus = { connected: false, status: 'DISCONNECTED' };
          setTimeout(() => { connect(); }, 3000);
        }
      }
    });
  } catch (err) {
    connecting = false;
    log(`Error inicializando sesión de WhatsApp: ${(err as Error).message}`);
  }
}

export const whatsappService = {
  getStatus(): WhatsAppStatus {
    return connectionStatus;
  },

  async initializeSession(): Promise<WhatsAppStatus> {
    log('Inicializando sesión persistente de WhatsApp (Baileys) en: ' + SESSION_DIR);
    await connect();
    return connectionStatus;
  },

  async resetSession(): Promise<WhatsAppStatus> {
    log('Reiniciando sesión de WhatsApp por solicitud del administrador...');
    if (sock) {
      try {
        sock.end(undefined);
      } catch { /* socket may already be closed */ }
      sock = null;
    }
    connecting = false;
    try {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    } catch (err) {
      log(`Error limpiando sesión: ${(err as Error).message}`);
    }
    connectionStatus = { connected: false, status: 'DISCONNECTED' };
    await connect();
    return connectionStatus;
  },

  async sendMessage(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
    if (!sock || connectionStatus.status !== 'CONNECTED') {
      return { success: false, error: 'La sesión de WhatsApp no está conectada.' };
    }

    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      return { success: false, error: `Número de teléfono inválido: ${phone}` };
    }

    try {
      const jid = `${digits}@s.whatsapp.net`;
      await sock.sendMessage(jid, { text: message });
      log(`Mensaje enviado a ${phone}`);
      return { success: true };
    } catch (err) {
      log(`Error enviando mensaje a ${phone}: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  async sendBulkMessage(
    recipients: Array<{ id: string; phone: string; name: string }>,
    messageTemplate: string
  ): Promise<Array<{ clientId: string; success: boolean; error?: string }>> {
    const results = [];
    log(`Iniciando despacho masivo con límite de tasa a ${recipients.length} clientes...`);

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const personalizedMsg = messageTemplate.replace(/{{client_name}}/g, recipient.name);

      log(`(${i + 1}/${recipients.length}) Enviando a ${recipient.name} (${recipient.phone})...`);
      const res = await this.sendMessage(recipient.phone, personalizedMsg);
      results.push({ clientId: recipient.id, success: res.success, error: res.error });

      // RATE LIMITING SAFETY DELAY: 2000ms delay between messages to prevent spam bans
      if (i < recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    log('Despacho masivo completado.');
    return results;
  }
};
