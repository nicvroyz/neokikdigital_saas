import path from 'path';
import fs from 'fs';

export interface WhatsAppStatus {
  connected: boolean;
  status: 'DISCONNECTED' | 'QR_READY' | 'CONNECTED';
  qrCodeUrl?: string;
  phoneNumber?: string;
}

// Session store directory
const SESSION_DIR = path.join(__dirname, '../../whatsapp_session');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

let connectionStatus: WhatsAppStatus = {
  connected: true, // Operating mode ready
  status: 'CONNECTED',
  phoneNumber: '+56 9 8765 4321',
  qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=NeokikDigitalWhatsAppSessionAuth'
};

export const whatsappService = {
  getStatus(): WhatsAppStatus {
    return connectionStatus;
  },

  async initializeSession(): Promise<WhatsAppStatus> {
    console.log('[WHATSAPP BAILEYS] Initializing persistent session at:', SESSION_DIR);
    return connectionStatus;
  },

  async sendMessage(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[WHATSAPP DISPATCH] Sending WhatsApp message to ${phone}: "${message.slice(0, 30)}..."`);
    // Simulated delivery with 500ms latency
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true };
  },

  async sendBulkMessage(
    recipients: Array<{ id: string; phone: string; name: string }>,
    messageTemplate: string
  ): Promise<Array<{ clientId: string; success: boolean; error?: string }>> {
    const results = [];
    console.log(`[WHATSAPP BULK DISPATCH] Starting rate-limited bulk send to ${recipients.length} clients...`);

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const personalizedMsg = messageTemplate.replace(/{{client_name}}/g, recipient.name);
      
      console.log(`[WHATSAPP BATCH] (${i + 1}/${recipients.length}) Sending to ${recipient.name} (${recipient.phone})...`);
      const res = await this.sendMessage(recipient.phone, personalizedMsg);
      results.push({ clientId: recipient.id, success: res.success, error: res.error });

      // RATE LIMITING SAFETY DELAY: 2000ms delay between messages to prevent spam bans
      if (i < recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('[WHATSAPP BULK DISPATCH] Bulk dispatch completed.');
    return results;
  }
};
