import { Pool } from 'pg';
import { config } from './env';
import { randomUUID } from 'crypto';

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

let isDbConnected = false;

// Test DB Connection
pool.connect((err, client, release) => {
  if (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('================================================================');
      console.error('❌ ERROR FATAL: No se puede conectar a la base de datos PostgreSQL en producción:');
      console.error(`   ${err.message}`);
      console.error('El servidor no puede iniciar sin una conexión a base de datos válida.');
      console.error('================================================================');
      process.exit(1);
    } else {
      console.warn('⚠️ PostgreSQL local database not detected:', err.message, '- Operating in High-Performance In-Memory Mode with sample agency data.');
      isDbConnected = false;
    }
  } else {
    console.log('✅ Connected to PostgreSQL database successfully.');
    isDbConnected = true;
    release();
  }
});

interface MockStore {
  admins: any[];
  clients: any[];
  campaigns: any[];
  recipients: any[];
  projects: any[];
  tasks: any[];
  work_logs: any[];
  payments: any[];
  notifications: any[];
  migrations: any[];
  migration_logs: any[];
  backups: any[];
  provisions: any[];
  job_queue: any[];
  audit_logs: any[];
  server_health_metrics: any[];
}

const mockMemoryStore: MockStore = {
  admins: [
    {
      id: 'admin-uuid-1',
      email: 'admin@neokikdigital.com',
      password_hash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW',
      name: 'Neokik Admin'
    }
  ],
  clients: [],
  campaigns: [],
  recipients: [],
  projects: [],
  tasks: [],
  work_logs: [],
  payments: [],
  notifications: [],
  migrations: [],
  migration_logs: [],
  backups: [],
  provisions: [],
  job_queue: [],
  audit_logs: [],
  server_health_metrics: []
};

export const query = async (text: string, params?: any[]) => {
  if (isDbConnected) {
    return pool.query(text, params);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Base de datos desconectada en producción. Solicitud denegada.');
  }

  const trimmed = text.trim();

  // ---------------- COMMUNICATIONS MODULE IN-MEMORY ROUTER ----------------

  if (trimmed.startsWith('SELECT c.*,') && trimmed.includes('FROM campaigns c')) {
    const list = mockMemoryStore.campaigns.map(c => {
      const recs = mockMemoryStore.recipients.filter(r => r.campaign_id === c.id);
      const sent = recs.filter(r => r.status === 'SENT').length;
      const failed = recs.filter(r => r.status === 'FAILED').length;
      return {
        ...c,
        total_recipients: recs.length,
        sent_count: sent,
        failed_count: failed
      };
    });
    return { rows: list };
  }

  if (trimmed.includes('FROM campaigns WHERE id = $1')) {
    const camp = mockMemoryStore.campaigns.find(c => c.id === params?.[0]);
    return { rows: camp ? [camp] : [] };
  }

  if (trimmed.includes('FROM campaign_recipients cr')) {
    const recs = mockMemoryStore.recipients.filter(r => r.campaign_id === params?.[0]);
    return { rows: recs };
  }

  if (trimmed.startsWith('INSERT INTO campaigns')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const newCamp: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      title: params?.[0 + offset],
      message: params?.[1 + offset],
      channel: params?.[2 + offset] || 'BOTH',
      target_audience: params?.[3 + offset] || 'ALL_CLIENTS',
      status: 'DRAFT',
      created_at: new Date()
    };
    mockMemoryStore.campaigns.unshift(newCamp);
    return { rows: [newCamp] };
  }

  if (trimmed.startsWith('INSERT INTO campaign_recipients')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const newRec: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      campaign_id: params?.[0 + offset],
      client_id: params?.[1 + offset],
      channel: params?.[2 + offset],
      status: params?.[3 + offset] || 'PENDING',
      sent_at: new Date()
    };
    mockMemoryStore.recipients.unshift(newRec);
    return { rows: [newRec] };
  }

  if (trimmed.startsWith('UPDATE campaigns SET status')) {
    const status = params?.[0];
    const id = params?.[1];
    const idx = mockMemoryStore.campaigns.findIndex(c => c.id === id);
    if (idx !== -1) {
      mockMemoryStore.campaigns[idx].status = status;
      if (status === 'SENT') mockMemoryStore.campaigns[idx].sent_at = new Date();
      return { rows: [mockMemoryStore.campaigns[idx]] };
    }
    return { rows: [] };
  }

  if (trimmed.startsWith('UPDATE campaign_recipients SET status')) {
    const status = params?.[0];
    const id = params?.[1];
    const idx = mockMemoryStore.recipients.findIndex(r => r.id === id);
    if (idx !== -1) {
      mockMemoryStore.recipients[idx].status = status;
      mockMemoryStore.recipients[idx].sent_at = new Date();
    }
    return { rows: [] };
  }

  // ---------------- OPERATIONS / CLIENTS ROUTER ----------------

  if (trimmed.includes('FROM admins WHERE email')) {
    const email = params?.[0];
    const admin = mockMemoryStore.admins.find(a => a.email === email);
    return { rows: admin ? [admin] : [] };
  }

  if (trimmed.includes('COUNT(*) as total_clients')) {
    const active = mockMemoryStore.clients.filter(c => c.status === 'ACTIVE').length;
    const expired = mockMemoryStore.clients.filter(c => c.status === 'EXPIRED').length;
    const suspended = mockMemoryStore.clients.filter(c => c.status === 'SUSPENDED').length;
    let mrr = 0;
    mockMemoryStore.clients.filter(c => c.status === 'ACTIVE').forEach(c => {
      if (c.plan_interval === 'MONTHLY') mrr += c.amount_per_period;
      if (c.plan_interval === 'QUARTERLY') mrr += c.amount_per_period / 3;
      if (c.plan_interval === 'SEMI_ANNUAL') mrr += c.amount_per_period / 6;
      if (c.plan_interval === 'ANNUAL') mrr += c.amount_per_period / 12;
    });

    return {
      rows: [{
        total_clients: mockMemoryStore.clients.length,
        active_clients: active,
        expired_clients: expired,
        suspended_clients: suspended,
        mrr: mrr
      }]
    };
  }

  if (trimmed.includes('BETWEEN CURRENT_DATE AND')) {
    return { rows: mockMemoryStore.clients };
  }

  if (trimmed.includes('FROM payment_records')) {
    const list = mockMemoryStore.payments.map((p: any) => {
      const cli = mockMemoryStore.clients.find((c: any) => c.id === p.client_id);
      return { ...p, client_name: cli?.name || 'Cliente', domain: cli?.domain || '' };
    });
    return { rows: list };
  }

  if (trimmed.startsWith('SELECT * FROM clients WHERE 1=1')) {
    let list = [...mockMemoryStore.clients];
    if (params?.[0] && params[0] !== 'ALL') {
      list = list.filter(c => c.status === params[0]);
    }
    return { rows: list };
  }

  if (trimmed.includes('SELECT * FROM clients WHERE id = $1')) {
    const cli = mockMemoryStore.clients.find(c => c.id === params?.[0]);
    return { rows: cli ? [cli] : [] };
  }

  if (trimmed.startsWith('INSERT INTO clients')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const newClient: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      name: params?.[0 + offset],
      company_name: params?.[1 + offset],
      email: params?.[2 + offset],
      phone: params?.[3 + offset],
      domain: params?.[4 + offset],
      subdomain: params?.[5 + offset],
      service_type: params?.[6 + offset],
      plan_interval: params?.[7 + offset],
      amount_per_period: params?.[8 + offset],
      currency: params?.[9 + offset] || 'CLP',
      status: params?.[10 + offset] || 'ACTIVE',
      last_payment_date: params?.[11 + offset],
      expiration_date: params?.[12 + offset],
      grace_period_days: params?.[13 + offset] || 5,
      doc_root: params?.[14 + offset],
      notes: params?.[15 + offset],
      created_at: new Date()
    };
    mockMemoryStore.clients.unshift(newClient);
    return { rows: [newClient] };
  }

  if (trimmed.startsWith('UPDATE clients SET')) {
    const id = params?.[0];
    const cliIndex = mockMemoryStore.clients.findIndex(c => c.id === id);
    if (cliIndex !== -1) {
      if (trimmed.includes("status = 'ACTIVE'")) {
        mockMemoryStore.clients[cliIndex].status = 'ACTIVE';
        mockMemoryStore.clients[cliIndex].last_payment_date = params?.[1];
        mockMemoryStore.clients[cliIndex].expiration_date = params?.[2];
      }
      return { rows: [mockMemoryStore.clients[cliIndex]] };
    }
    return { rows: [] };
  }

  if (trimmed.startsWith('INSERT INTO payment_records')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const pmt: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      client_id: params?.[0 + offset],
      amount: params?.[1 + offset],
      currency: params?.[2 + offset],
      paid_at: new Date(),
      period_start: params?.[3 + offset],
      period_end: params?.[4 + offset],
      payment_method: params?.[5 + offset],
      notes: params?.[6 + offset]
    };
    mockMemoryStore.payments.unshift(pmt);
    return { rows: [pmt] };
  }

  if (trimmed.startsWith('DELETE FROM clients')) {
    const id = params?.[0];
    mockMemoryStore.clients = mockMemoryStore.clients.filter(c => c.id !== id);
    return { rows: [] };
  }

  if (trimmed.startsWith('SELECT * FROM migrations')) {
    if (trimmed.includes('WHERE id = $1')) {
      const mig = mockMemoryStore.migrations.find(m => m.id === params?.[0]);
      return { rows: mig ? [mig] : [] };
    }
    return { rows: mockMemoryStore.migrations };
  }

  if (trimmed.startsWith('SELECT * FROM migration_logs')) {
    if (trimmed.includes('WHERE migration_id = $1 AND step = $2')) {
      const logs = mockMemoryStore.migration_logs.filter(l => l.migration_id === params?.[0] && l.step === params?.[1]);
      return { rows: logs };
    }
    if (trimmed.includes('WHERE migration_id = $1')) {
      const logs = mockMemoryStore.migration_logs.filter(l => l.migration_id === params?.[0]);
      return { rows: logs };
    }
    return { rows: mockMemoryStore.migration_logs };
  }

  if (trimmed.startsWith('UPDATE migration_logs SET')) {
    const id = params?.[trimmed.includes('WHERE id = $5') ? 4 : 0];
    const idx = mockMemoryStore.migration_logs.findIndex(l => l.id === id);
    if (idx !== -1) {
      mockMemoryStore.migration_logs[idx].message = params?.[0];
      mockMemoryStore.migration_logs[idx].status = params?.[1];
      mockMemoryStore.migration_logs[idx].percentage = params?.[2];
      mockMemoryStore.migration_logs[idx].completed_at = params?.[3];
      return { rows: [mockMemoryStore.migration_logs[idx]] };
    }
    return { rows: [] };
  }

  if (trimmed.startsWith('SELECT * FROM backups')) {
    if (trimmed.includes('WHERE id = $1')) {
      const bkp = mockMemoryStore.backups.find(b => b.id === params?.[0]);
      return { rows: bkp ? [bkp] : [] };
    }
    return { rows: mockMemoryStore.backups };
  }

  if (trimmed.startsWith('SELECT * FROM provisions')) {
    if (trimmed.includes('WHERE id = $1')) {
      const prov = mockMemoryStore.provisions.find(p => p.id === params?.[0]);
      return { rows: prov ? [prov] : [] };
    }
    return { rows: mockMemoryStore.provisions };
  }

  if (trimmed.startsWith('INSERT INTO migrations')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const newMig: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      domain: params?.[0 + offset],
      backup_type: params?.[1 + offset],
      backup_path: params?.[2 + offset],
      backup_size_bytes: params?.[3 + offset],
      status: params?.[4 + offset] || 'PENDING',
      created_at: params?.[5 + offset] || new Date().toISOString(),
      updated_at: params?.[6 + offset] || new Date().toISOString(),
    };
    mockMemoryStore.migrations.unshift(newMig);
    return { rows: [newMig] };
  }

  if (trimmed.startsWith('INSERT INTO migration_logs')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const isShortQuery = (params ? params.length - offset : 0) < 5;
    const newLog: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      migration_id: params?.[0 + offset],
      step: isShortQuery ? 'analyze_backup' : params?.[1 + offset],
      message: isShortQuery ? 'Análisis del respaldo completado con éxito.' : params?.[2 + offset],
      status: isShortQuery ? 'SUCCESS' : (params?.[3 + offset] || 'RUNNING'),
      percentage: isShortQuery ? 15 : (params?.[4 + offset] || 0),
      started_at: isShortQuery ? (params?.[1 + offset] || new Date().toISOString()) : (params?.[5 + offset] || new Date().toISOString()),
      completed_at: isShortQuery ? params?.[2 + offset] : null,
    };
    mockMemoryStore.migration_logs.push(newLog);
    return { rows: [newLog] };
  }

  if (trimmed.startsWith('INSERT INTO backups')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const newBkp: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      client_id: params?.[0 + offset],
      filename: params?.[1 + offset],
      file_path: params?.[2 + offset],
      file_size: params?.[3 + offset],
      backup_type: params?.[4 + offset],
      version: params?.[5 + offset] || 1,
      notes: params?.[6 + offset] || '',
      created_at: params?.[7 + offset] || new Date().toISOString(),
    };
    mockMemoryStore.backups.unshift(newBkp);
    return { rows: [newBkp] };
  }

  if (trimmed.startsWith('INSERT INTO provisions')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const newProv: any = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      client_id: params?.[0 + offset],
      domain: params?.[1 + offset],
      project_type: params?.[2 + offset],
      manage_hosting: params?.[3 + offset],
      manage_email: params?.[4 + offset],
      email_accounts: typeof params?.[5 + offset] === 'string' ? JSON.parse(params?.[5 + offset]) : params?.[5 + offset],
      status: params?.[6 + offset] || 'PENDING',
      created_at: params?.[7 + offset] || new Date().toISOString(),
    };
    mockMemoryStore.provisions.unshift(newProv);
    return { rows: [newProv] };
  }

  if (trimmed.startsWith('UPDATE migrations SET')) {
    let id = params?.[0];
    if (trimmed.includes('WHERE id = $2')) id = params?.[1];
    else if (trimmed.includes('WHERE id = $3')) id = params?.[2];
    else if (trimmed.includes('WHERE id = $4')) id = params?.[3];
    else if (trimmed.includes('WHERE id = $5')) id = params?.[4];
    else if (trimmed.includes('WHERE id = $6')) id = params?.[5];
    
    const idx = mockMemoryStore.migrations.findIndex(m => m.id === id);
    if (idx !== -1) {
      // Handle rollback_step updates
      if (trimmed.includes('rollback_step')) {
        const rollbackMatch = trimmed.match(/rollback_step\s*=\s*'([^']+)'/);
        if (rollbackMatch) {
          mockMemoryStore.migrations[idx].rollback_step = rollbackMatch[1];
        }
      }
      if (trimmed.includes("status = 'READY'") && trimmed.includes('domain = $1')) {
        mockMemoryStore.migrations[idx].status = 'READY';
        mockMemoryStore.migrations[idx].domain = params?.[0];
        mockMemoryStore.migrations[idx].detected_project_type = params?.[1];
        mockMemoryStore.migrations[idx].analysis_report = typeof params?.[2] === 'string' ? JSON.parse(params?.[2]) : params?.[2];
        mockMemoryStore.migrations[idx].migration_score = params?.[3];
        mockMemoryStore.migrations[idx].updated_at = params?.[4];
      } else if (trimmed.includes('status = $1') && trimmed.includes('analysis_report = $3')) {
        mockMemoryStore.migrations[idx].status = params?.[0];
        mockMemoryStore.migrations[idx].detected_project_type = params?.[1];
        mockMemoryStore.migrations[idx].analysis_report = typeof params?.[2] === 'string' ? JSON.parse(params?.[2]) : params?.[2];
        mockMemoryStore.migrations[idx].migration_score = params?.[3];
        mockMemoryStore.migrations[idx].updated_at = params?.[4];
      } else if (trimmed.includes('status = $1') && trimmed.includes('simulation_report = $2') && trimmed.includes('migration_score = $3')) {
        mockMemoryStore.migrations[idx].status = params?.[0];
        mockMemoryStore.migrations[idx].simulation_report = typeof params?.[1] === 'string' ? JSON.parse(params?.[1]) : params?.[1];
        mockMemoryStore.migrations[idx].migration_score = params?.[2];
        mockMemoryStore.migrations[idx].updated_at = params?.[3];
      } else if (trimmed.includes('status = $1') && trimmed.includes('simulation_report = $2')) {
        mockMemoryStore.migrations[idx].status = params?.[0];
        mockMemoryStore.migrations[idx].simulation_report = typeof params?.[1] === 'string' ? JSON.parse(params?.[1]) : params?.[1];
        mockMemoryStore.migrations[idx].updated_at = params?.[2];
      } else if (trimmed.includes('status = $1') && trimmed.includes('started_at = $2')) {
        mockMemoryStore.migrations[idx].status = params?.[0];
        mockMemoryStore.migrations[idx].started_at = params?.[1];
        mockMemoryStore.migrations[idx].updated_at = params?.[2];
      } else if (trimmed.includes('status = $1') && trimmed.includes('completed_at = $2')) {
        mockMemoryStore.migrations[idx].status = params?.[0];
        mockMemoryStore.migrations[idx].completed_at = params?.[1];
        mockMemoryStore.migrations[idx].updated_at = params?.[2];
      } else if (trimmed.includes('status = $1')) {
        mockMemoryStore.migrations[idx].status = params?.[0];
        if (trimmed.includes('updated_at = $2')) {
          mockMemoryStore.migrations[idx].updated_at = params?.[1];
        }
      }
      // Catch-all: handle literal status values (e.g. status = 'FAILED', status = 'ROLLED_BACK')
      const literalStatusMatch = trimmed.match(/status\s*=\s*'([^']+)'/);
      if (literalStatusMatch && !trimmed.includes('status = $1')) {
        mockMemoryStore.migrations[idx].status = literalStatusMatch[1];
      }
      return { rows: [mockMemoryStore.migrations[idx]] };
    }
    return { rows: [] };
  }

  if (trimmed.startsWith('UPDATE provisions SET')) {
    const id = params?.[2];
    const idx = mockMemoryStore.provisions.findIndex(p => p.id === id);
    if (idx !== -1) {
      mockMemoryStore.provisions[idx].status = params?.[0];
      mockMemoryStore.provisions[idx].completed_at = params?.[1];
      return { rows: [mockMemoryStore.provisions[idx]] };
    }
    return { rows: [] };
  }

  if (trimmed.startsWith('DELETE FROM backups')) {
    const id = params?.[0];
    mockMemoryStore.backups = mockMemoryStore.backups.filter(b => b.id !== id);
    return { rows: [] };
  }

  if (trimmed.startsWith('DELETE FROM migrations')) {
    const id = params?.[0];
    mockMemoryStore.migrations = mockMemoryStore.migrations.filter(m => m.id !== id);
    return { rows: [] };
  }

  if (trimmed.startsWith('DELETE FROM migration_logs')) {
    const migId = params?.[0];
    mockMemoryStore.migration_logs = mockMemoryStore.migration_logs.filter(l => l.migration_id !== migId);
    return { rows: [] };
  }

  if (trimmed.includes('FROM clients WHERE domain = $1')) {
    if (trimmed.startsWith('DELETE')) {
      mockMemoryStore.clients = mockMemoryStore.clients.filter(c => c.domain !== params?.[0]);
      return { rows: [] };
    }
    const cli = mockMemoryStore.clients.find(c => c.domain === params?.[0]);
    return { rows: cli ? [cli] : [] };
  }

  if (trimmed.startsWith('SELECT * FROM job_queue')) {
    if (trimmed.includes("reference_id = $1 AND status = 'PENDING'")) {
      const jobs = mockMemoryStore.job_queue.filter(j => j.reference_id === params?.[0] && j.status === 'PENDING');
      return { rows: jobs };
    }
    if (trimmed.includes("status = 'PROCESSING'")) {
      const jobs = mockMemoryStore.job_queue.filter(j => j.status === 'PROCESSING');
      return { rows: jobs };
    }
    if (trimmed.includes("status = 'PENDING'")) {
      const jobs = mockMemoryStore.job_queue
        .filter(j => j.status === 'PENDING')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return { rows: jobs.slice(0, 1) };
    }
    if (trimmed.includes('WHERE id = $1')) {
      const job = mockMemoryStore.job_queue.find(j => j.id === params?.[0]);
      return { rows: job ? [job] : [] };
    }
    return { rows: mockMemoryStore.job_queue };
  }

  if (trimmed.startsWith('INSERT INTO job_queue')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    
    const parseField = (val: any) => {
      if (typeof val !== 'string') return val;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    };

    let status = 'PENDING';
    if (trimmed.includes("'PROCESSING'")) {
      status = 'PROCESSING';
    }

    let attempts = 0;
    if (trimmed.includes("'PROCESSING', 1") || trimmed.includes("1, 3")) {
      attempts = 1;
    }

    let jobId = hasExplicitId ? params?.[0] : randomUUID();
    let jobType = 'MIGRATION';
    let referenceId = '';
    let payloadStr = '{}';

    if (trimmed.includes("VALUES ($1, 'MIGRATION', $2")) {
      jobId = params?.[0];
      jobType = 'MIGRATION';
      referenceId = params?.[1];
    } else {
      const offset = hasExplicitId ? 1 : 0;
      jobType = params?.[0 + offset] || 'MIGRATION';
      referenceId = params?.[1 + offset];
      payloadStr = params?.[2 + offset] || '{}';
    }

    const newJob: any = {
      id: jobId,
      job_type: jobType,
      reference_id: referenceId,
      status: status,
      payload: parseField(payloadStr),
      attempts: attempts,
      max_attempts: 3,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockMemoryStore.job_queue.push(newJob);
    return { rows: [newJob] };
  }

  if (trimmed.startsWith('UPDATE job_queue SET')) {
    const id = params?.[trimmed.includes('WHERE id = $3') ? 2 : trimmed.includes('WHERE id = $4') ? 3 : 0];
    const idx = mockMemoryStore.job_queue.findIndex(j => j.id === id);
    if (idx !== -1) {
      if (trimmed.includes('status = $1') && trimmed.includes('error_message = $2')) {
        mockMemoryStore.job_queue[idx].status = params?.[0];
        mockMemoryStore.job_queue[idx].error_message = params?.[1];
      } else if (trimmed.includes('status = $1') && trimmed.includes('attempts = $2')) {
        mockMemoryStore.job_queue[idx].status = params?.[0];
        mockMemoryStore.job_queue[idx].attempts = params?.[1];
      } else if (trimmed.includes('status = $1')) {
        mockMemoryStore.job_queue[idx].status = params?.[0];
      }
      mockMemoryStore.job_queue[idx].updated_at = new Date().toISOString();
      return { rows: [mockMemoryStore.job_queue[idx]] };
    }
    return { rows: [] };
  }

  if (trimmed.startsWith('INSERT INTO audit_logs')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    
    const parseField = (val: any) => {
      if (typeof val !== 'string') return val;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    };

    const newLog = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      user_id: params?.[0 + offset],
      client_id: params?.[1 + offset],
      action: params?.[2 + offset],
      entity: params?.[3 + offset],
      old_value: parseField(params?.[4 + offset]),
      new_value: parseField(params?.[5 + offset]),
      metadata: parseField(params?.[6 + offset]),
      status: params?.[7 + offset] || 'SUCCESS',
      ip: params?.[8 + offset],
      created_at: new Date().toISOString(),
    };
    mockMemoryStore.audit_logs.push(newLog);
    return { rows: [newLog] };
  }

  if (trimmed.startsWith('SELECT * FROM audit_logs')) {
    return { rows: mockMemoryStore.audit_logs };
  }

  if (trimmed.startsWith('INSERT INTO server_health_metrics')) {
    const hasExplicitId = trimmed.includes('(id,') || trimmed.includes('(id ');
    const offset = hasExplicitId ? 1 : 0;
    const newMetric = {
      id: hasExplicitId ? params?.[0] : randomUUID(),
      cpu_usage: params?.[0 + offset],
      ram_total_gb: params?.[1 + offset],
      ram_used_gb: params?.[2 + offset],
      disk_total_gb: params?.[3 + offset],
      disk_used_gb: params?.[4 + offset],
      docker_status: params?.[5 + offset],
      mailcow_status: params?.[6 + offset],
      redis_status: params?.[7 + offset],
      postgres_status: params?.[8 + offset],
      response_time_ms: params?.[9 + offset],
      created_at: new Date().toISOString(),
    };
    mockMemoryStore.server_health_metrics.push(newMetric);
    return { rows: [newMetric] };
  }

  if (trimmed.startsWith('SELECT * FROM server_health_metrics')) {
    if (trimmed.includes('ORDER BY created_at DESC LIMIT 1')) {
      const sorted = [...mockMemoryStore.server_health_metrics].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { rows: sorted.slice(0, 1) };
    }
    return { rows: mockMemoryStore.server_health_metrics };
  }

  return { rows: mockMemoryStore.clients };
};
