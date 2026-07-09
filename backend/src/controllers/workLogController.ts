import { Request, Response } from 'express';
import { workLogService } from '../services/workLogService';

export const workLogController = {
  async getAll(req: Request, res: Response) {
    try {
      const taskId = req.query.task_id as string;
      const logs = await workLogService.getAllWorkLogs(taskId);
      return res.json(logs);
    } catch (err) {
      console.error('Error fetching work logs:', err);
      return res.status(500).json({ error: 'Failed to fetch work logs' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { task_id, hours_spent } = req.body;
      if (!task_id || !hours_spent) {
        return res.status(400).json({ error: 'Missing required fields: task_id, hours_spent' });
      }
      const log = await workLogService.createWorkLog(req.body);
      return res.status(201).json(log);
    } catch (err) {
      console.error('Error creating work log:', err);
      return res.status(500).json({ error: 'Failed to create work log' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      await workLogService.deleteWorkLog(req.params.id);
      return res.json({ message: 'Work log deleted successfully' });
    } catch (err) {
      console.error('Error deleting work log:', err);
      return res.status(500).json({ error: 'Failed to delete work log' });
    }
  }
};
