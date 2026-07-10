import { query } from '../config/db';

export interface TaskData {
  id?: string;
  project_id: string;
  title: string;
  description?: string;
  status?: 'TODO' | 'DOING' | 'DONE';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  estimated_hours?: number;
  due_date?: string;
}

export const taskService = {
  async getAllTasks(projectId?: string) {
    let sql = `SELECT t.*, p.name as project_name, c.name as client_name 
               FROM tasks t 
               JOIN projects p ON p.id = t.project_id
               JOIN clients c ON c.id = p.client_id WHERE 1=1`;
    const params: any[] = [];
    if (projectId) {
      params.push(projectId);
      sql += ` AND t.project_id = $${params.length}`;
    }
    sql += ` ORDER BY t.created_at DESC`;
    const res = await query(sql, params);
    return res.rows;
  },

  async getTaskById(id: string) {
    const res = await query(
      `SELECT t.*, p.name as project_name, c.name as client_name 
       FROM tasks t 
       JOIN projects p ON p.id = t.project_id 
       JOIN clients c ON c.id = p.client_id 
       WHERE t.id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    
    const task = res.rows[0];
    const logsRes = await query(`SELECT * FROM work_logs WHERE task_id = $1 ORDER BY date DESC`, [id]);
    task.work_logs = logsRes.rows;
    return task;
  },

  async createTask(data: TaskData) {
    const res = await query(
      `INSERT INTO tasks (project_id, title, description, status, priority, estimated_hours, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        data.project_id,
        data.title,
        data.description || null,
        data.status || 'TODO',
        data.priority || 'MEDIUM',
        data.estimated_hours || 0,
        data.due_date || null
      ]
    );
    return res.rows[0];
  },

  async updateTask(id: string, data: Partial<TaskData>) {
    const allowedColumns = new Set([
      'project_id',
      'title',
      'description',
      'status',
      'priority',
      'estimated_hours',
      'due_date'
    ]);

    const fields: string[] = [];
    const params: any[] = [id];

    Object.keys(data).forEach((key) => {
      if (allowedColumns.has(key) && data[key as keyof TaskData] !== undefined) {
        params.push(data[key as keyof TaskData]);
        fields.push(`${key} = $${params.length}`);
      }
    });

    if (fields.length === 0) return this.getTaskById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const res = await query(sql, params);
    return res.rows[0];
  },

  async deleteTask(id: string) {
    await query('DELETE FROM tasks WHERE id = $1', [id]);
    return true;
  }
};
