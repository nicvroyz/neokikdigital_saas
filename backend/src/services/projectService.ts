import { query } from '../config/db';

export interface ProjectData {
  id?: string;
  client_id: string;
  name: string;
  description?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'DONE';
  start_date: string;
  end_date?: string;
}

export const projectService = {
  async getAllProjects(clientId?: string) {
    let sql = `SELECT p.*, c.name as client_name, c.domain 
               FROM projects p 
               JOIN clients c ON c.id = p.client_id WHERE 1=1`;
    const params: any[] = [];
    if (clientId) {
      params.push(clientId);
      sql += ` AND p.client_id = $${params.length}`;
    }
    sql += ` ORDER BY p.created_at DESC`;
    const res = await query(sql, params);
    return res.rows;
  },

  async getProjectById(id: string) {
    const res = await query(
      `SELECT p.*, c.name as client_name, c.domain 
       FROM projects p 
       JOIN clients c ON c.id = p.client_id 
       WHERE p.id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;

    const project = res.rows[0];
    const tasksRes = await query(`SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC`, [id]);
    project.tasks = tasksRes.rows;
    return project;
  },

  async createProject(data: ProjectData) {
    const res = await query(
      `INSERT INTO projects (client_id, name, description, status, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        data.client_id,
        data.name,
        data.description || null,
        data.status || 'ACTIVE',
        data.start_date,
        data.end_date || null
      ]
    );
    return res.rows[0];
  },

  async updateProject(id: string, data: Partial<ProjectData>) {
    const fields: string[] = [];
    const params: any[] = [id];

    Object.keys(data).forEach((key) => {
      if (key !== 'id' && data[key as keyof ProjectData] !== undefined) {
        params.push(data[key as keyof ProjectData]);
        fields.push(`${key} = $${params.length}`);
      }
    });

    if (fields.length === 0) return this.getProjectById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const res = await query(sql, params);
    return res.rows[0];
  },

  async deleteProject(id: string) {
    await query('DELETE FROM projects WHERE id = $1', [id]);
    return true;
  }
};
