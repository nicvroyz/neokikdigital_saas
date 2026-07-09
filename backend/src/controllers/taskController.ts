import { Request, Response } from 'express';
import { taskService } from '../services/taskService';

export const taskController = {
  async getAll(req: Request, res: Response) {
    try {
      const projectId = req.query.project_id as string;
      const tasks = await taskService.getAllTasks(projectId);
      return res.json(tasks);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const task = await taskService.getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      return res.json(task);
    } catch (err) {
      console.error('Error fetching task:', err);
      return res.status(500).json({ error: 'Failed to fetch task' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { project_id, title } = req.body;
      if (!project_id || !title) {
        return res.status(400).json({ error: 'Missing required fields: project_id, title' });
      }
      const task = await taskService.createTask(req.body);
      return res.status(201).json(task);
    } catch (err) {
      console.error('Error creating task:', err);
      return res.status(500).json({ error: 'Failed to create task' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const updated = await taskService.updateTask(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      console.error('Error updating task:', err);
      return res.status(500).json({ error: 'Failed to update task' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      await taskService.deleteTask(req.params.id);
      return res.json({ message: 'Task deleted successfully' });
    } catch (err) {
      console.error('Error deleting task:', err);
      return res.status(500).json({ error: 'Failed to delete task' });
    }
  }
};
