import { Request, Response } from 'express';
import { campaignService } from '../services/campaignService';
import { whatsappService } from '../services/whatsappService';

export const communicationsController = {
  async getCampaigns(req: Request, res: Response) {
    try {
      const campaigns = await campaignService.getAllCampaigns();
      return res.json(campaigns);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      return res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
  },

  async getCampaignById(req: Request, res: Response) {
    try {
      const campaign = await campaignService.getCampaignById(req.params.id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      return res.json(campaign);
    } catch (err) {
      console.error('Error fetching campaign:', err);
      return res.status(500).json({ error: 'Failed to fetch campaign' });
    }
  },

  async createCampaign(req: Request, res: Response) {
    try {
      const { title, message, channel, target_audience } = req.body;
      if (!title || !message) {
        return res.status(400).json({ error: 'Missing required fields: title, message' });
      }
      const campaign = await campaignService.createCampaign(req.body);
      return res.status(201).json(campaign);
    } catch (err) {
      console.error('Error creating campaign:', err);
      return res.status(500).json({ error: 'Failed to create campaign' });
    }
  },

  async sendCampaign(req: Request, res: Response) {
    try {
      const sentCampaign = await campaignService.sendCampaign(req.params.id);
      return res.json({ message: 'Campaign dispatched successfully', campaign: sentCampaign });
    } catch (err: any) {
      console.error('Error dispatching campaign:', err);
      return res.status(500).json({ error: err.message || 'Failed to send campaign' });
    }
  },

  async getWhatsAppStatus(req: Request, res: Response) {
    try {
      const status = whatsappService.getStatus();
      return res.json(status);
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
      return res.status(500).json({ error: 'Failed to fetch WhatsApp status' });
    }
  }
};
