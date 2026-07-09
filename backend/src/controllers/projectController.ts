import { Request, Response } from 'express';
import { projectService } from '../services/projectService';

export const projectController = {
  async getAll(req: Request, res: Response) {
    try {
      const clientId = req.query.client_id as string;
      const projects = await projectService.getAllProjects(clientId);
      return res.json(projects);
    } catch (err) {
      console.error('Error fetching projects:', err);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const project = await projectService.getProjectById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      return res.json(project);
    } catch (err) {
      console.error('Error fetching project:', err);
      return res.status(500).json({ error: 'Failed to fetch project' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { client_id, name, start_date } = req.body;
      if (!client_id || !name || !start_date) {
        return res.status(400).json({ error: 'Missing required fields: client_id, name, start_date' });
      }
      const project = await projectService.createProject(req.body);
      return res.status(201).json(project);
    } catch (err) {
      console.error('Error creating project:', err);
      return res.status(500).json({ error: 'Failed to create project' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const updated = await projectService.updateProject(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      console.error('Error updating project:', err);
      return res.status(500).json({ error: 'Failed to update project' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      await projectService.deleteProject(req.params.id);
      return res.json({ message: 'Project deleted successfully' });
    } catch (err) {
      console.error('Error deleting project:', err);
      return res.status(500).json({ error: 'Failed to delete project' });
    }
  }
};
