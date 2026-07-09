import { Request, Response } from 'express';
import { clientService } from '../services/clientService';

export const clientController = {
  async getAll(req: Request, res: Response) {
    try {
      const status = req.query.status as string;
      const search = req.query.search as string;
      const clients = await clientService.getAllClients(status, search);
      return res.json(clients);
    } catch (err) {
      console.error('Error fetching clients:', err);
      return res.status(500).json({ error: 'Failed to fetch clients' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const client = await clientService.getClientById(req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      return res.json(client);
    } catch (err) {
      console.error('Error fetching client:', err);
      return res.status(500).json({ error: 'Failed to fetch client' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { name, email, domain, service_type, plan_interval, amount_per_period, last_payment_date, expiration_date } = req.body;
      if (!name || !email || !domain || !last_payment_date || !expiration_date) {
        return res.status(400).json({ error: 'Required fields missing: name, email, domain, last_payment_date, expiration_date' });
      }

      const client = await clientService.createClient(req.body);
      return res.status(201).json(client);
    } catch (err: any) {
      console.error('Error creating client:', err);
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Domain already registered' });
      }
      return res.status(500).json({ error: 'Failed to create client' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const updated = await clientService.updateClient(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      console.error('Error updating client:', err);
      return res.status(500).json({ error: 'Failed to update client' });
    }
  },

  async renew(req: Request, res: Response) {
    try {
      const { amount, payment_method, notes } = req.body;
      if (!amount) return res.status(400).json({ error: 'Renewal amount required' });

      const renewed = await clientService.renewSubscription(req.params.id, Number(amount), payment_method, notes);
      return res.json({ message: 'Subscription renewed successfully', client: renewed });
    } catch (err: any) {
      console.error('Error renewing client:', err);
      return res.status(500).json({ error: err.message || 'Failed to renew subscription' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const success = await clientService.deleteClient(req.params.id);
      if (!success) return res.status(404).json({ error: 'Client not found' });
      return res.json({ message: 'Client deleted successfully' });
    } catch (err) {
      console.error('Error deleting client:', err);
      return res.status(500).json({ error: 'Failed to delete client' });
    }
  }
};
