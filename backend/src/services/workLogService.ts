import { query } from '../config/db';

export interface WorkLogData {
  id?: string;
  task_id: string;
  date?: string;
  hours_spent: number;
  notes?: string;
}

export const workLogService = {
  async getAllWorkLogs(taskId?: string) {
    let sql = `SELECT w.*, t.title as task_title, p.name as project_name, c.name as client_name 
               FROM work_logs w 
               JOIN tasks t ON t.id = w.task_id
               JOIN projects p ON p.id = t.project_id
               JOIN clients c ON c.id = p.client_id WHERE 1=1`;
    const params: any[] = [];
    if (taskId) {
      params.push(taskId);
      sql += ` AND w.task_id = $${params.length}`;
    }
    sql += ` ORDER BY w.date DESC, w.created_at DESC`;
    const res = await query(sql, params);
    return res.rows;
  },

  async createWorkLog(data: WorkLogData) {
    const today = new Date().toISOString().split('T')[0];
    const res = await query(
      `INSERT INTO work_logs (task_id, date, hours_spent, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        data.task_id,
        data.date || today,
        data.hours_spent,
        data.notes || null
      ]
    );
    return res.rows[0];
  },

  async deleteWorkLog(id: string) {
    await query('DELETE FROM work_logs WHERE id = $1', [id]);
    return true;
  }
};
