import { query } from '../config/db';

function log(msg: string) {
  console.log(`[QUEUE SERVICE] ${msg}`);
}

export interface JobRecord {
  id: string;
  job_type: 'MIGRATION' | 'PROVISION';
  reference_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  payload: any;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export const queueService = {
  async enqueue(jobType: 'MIGRATION' | 'PROVISION', referenceId: string, payload: any): Promise<JobRecord> {
    log(`Encolando trabajo: ${jobType} (Referencia: ${referenceId})`);
    
    // Check if the job already exists
    const existing = await query('SELECT * FROM job_queue WHERE reference_id = $1 AND status = \'PENDING\'', [referenceId]);
    if (existing.rows.length > 0) return existing.rows[0];

    const res = await query(
      `INSERT INTO job_queue (job_type, reference_id, status, payload, attempts, max_attempts)
       VALUES ($1, $2, 'PENDING', $3, 0, 3) RETURNING *`,
      [jobType, referenceId, JSON.stringify(payload)]
    );

    return res.rows[0];
  },

  async getNextPendingJob(): Promise<JobRecord | null> {
    const pendingJobs = await query('SELECT * FROM job_queue WHERE status = \'PENDING\' ORDER BY created_at ASC LIMIT 1');
    if (pendingJobs.rows.length === 0) return null;
    return pendingJobs.rows[0];
  },

  async getCrashedJobs(): Promise<JobRecord[]> {
    const crashedJobs = await query('SELECT * FROM job_queue WHERE status = \'PROCESSING\'');
    return crashedJobs.rows;
  },

  async updateJobStatus(jobId: string, status: JobRecord['status'], errorMessage: string | null = null): Promise<void> {
    log(`Actualizando estado del trabajo ${jobId} a: ${status}`);
    if (errorMessage) {
      await query(
        'UPDATE job_queue SET status = $1, error_message = $2, updated_at = $3 WHERE id = $4',
        [status, errorMessage, new Date().toISOString(), jobId]
      );
    } else {
      await query(
        'UPDATE job_queue SET status = $1, updated_at = $2 WHERE id = $3',
        [status, new Date().toISOString(), jobId]
      );
    }
  },

  async incrementAttempts(jobId: string, currentAttempts: number): Promise<void> {
    await query(
      'UPDATE job_queue SET attempts = $1, status = \'PROCESSING\', updated_at = $2 WHERE id = $3',
      [currentAttempts + 1, new Date().toISOString(), jobId]
    );
  }
};
