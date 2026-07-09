import { query } from '../config/db';
import { whatsappService } from './whatsappService';
import { mailerService } from './mailerService';

export interface CampaignData {
  id?: string;
  title: string;
  message: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  target_audience: 'ALL_CLIENTS' | 'ACTIVE_CLIENTS' | 'SELECTED_CLIENTS';
  selected_client_ids?: string[];
}

export const campaignService = {
  async getAllCampaigns() {
    const res = await query(
      `SELECT c.*, 
        COUNT(r.id) as total_recipients,
        COUNT(CASE WHEN r.status = 'SENT' THEN 1 END) as sent_count,
        COUNT(CASE WHEN r.status = 'FAILED' THEN 1 END) as failed_count
       FROM campaigns c
       LEFT JOIN campaign_recipients r ON r.campaign_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );
    return res.rows;
  },

  async getCampaignById(id: string) {
    const res = await query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    if (res.rows.length === 0) return null;

    const campaign = res.rows[0];
    const recRes = await query(
      `SELECT cr.*, cl.name as client_name, cl.email, cl.phone 
       FROM campaign_recipients cr
       JOIN clients cl ON cl.id = cr.client_id
       WHERE cr.campaign_id = $1`,
      [id]
    );
    campaign.recipients = recRes.rows;
    return campaign;
  },

  async createCampaign(data: CampaignData) {
    const res = await query(
      `INSERT INTO campaigns (title, message, channel, target_audience, status)
       VALUES ($1, $2, $3, $4, 'DRAFT') RETURNING *`,
      [data.title, data.message, data.channel, data.target_audience]
    );
    const campaign = res.rows[0];

    // Determine target clients
    let clientQuery = 'SELECT * FROM clients';
    if (data.target_audience === 'ACTIVE_CLIENTS') {
      clientQuery += " WHERE status = 'ACTIVE'";
    }
    const clientsRes = await query(clientQuery);
    let clients = clientsRes.rows;

    if (data.target_audience === 'SELECTED_CLIENTS' && data.selected_client_ids) {
      clients = clients.filter(c => data.selected_client_ids?.includes(c.id));
    }

    // Create recipient records
    for (const client of clients) {
      if (data.channel === 'EMAIL' || data.channel === 'BOTH') {
        await query(
          `INSERT INTO campaign_recipients (campaign_id, client_id, channel, status) VALUES ($1, $2, 'EMAIL', 'PENDING')`,
          [campaign.id, client.id]
        );
      }
      if (data.channel === 'WHATSAPP' || data.channel === 'BOTH') {
        await query(
          `INSERT INTO campaign_recipients (campaign_id, client_id, channel, status) VALUES ($1, $2, 'WHATSAPP', 'PENDING')`,
          [campaign.id, client.id]
        );
      }
    }

    return this.getCampaignById(campaign.id);
  },

  async sendCampaign(id: string) {
    const campaign = await this.getCampaignById(id);
    if (!campaign) throw new Error('Campaign not found');

    await query(`UPDATE campaigns SET status = 'SENDING' WHERE id = $1`, [id]);

    const recipients = campaign.recipients;

    for (const rec of recipients) {
      try {
        if (rec.channel === 'EMAIL') {
          const sent = await mailerService.sendExpirationWarning(rec.email, rec.client_name, campaign.title, 0, new Date().toISOString());
          await query(
            `UPDATE campaign_recipients SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [sent ? 'SENT' : 'FAILED', rec.id]
          );
        } else if (rec.channel === 'WHATSAPP') {
          const waRes = await whatsappService.sendMessage(rec.phone || '+56912345678', campaign.message);
          await query(
            `UPDATE campaign_recipients SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [waRes.success ? 'SENT' : 'FAILED', rec.id]
          );
        }
      } catch (err: any) {
        await query(
          `UPDATE campaign_recipients SET status = 'FAILED', error_message = $1 WHERE id = $2`,
          [err.message || 'Transmission error', rec.id]
        );
      }
    }

    await query(`UPDATE campaigns SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    return this.getCampaignById(id);
  }
};
