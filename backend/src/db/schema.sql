-- Neokik Digital SaaS - Full Database Schema with Operations & Communications Modules

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE plan_interval AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');
CREATE TYPE client_status AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');
CREATE TYPE service_type AS ENUM ('WEB_HOSTING', 'MAINTENANCE', 'HOSTING_AND_MAINTENANCE', 'CUSTOM');

-- Operations Enums
CREATE TYPE project_status AS ENUM ('ACTIVE', 'PAUSED', 'DONE');
CREATE TYPE task_status AS ENUM ('TODO', 'DOING', 'DONE');
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- Communications Enums
CREATE TYPE campaign_channel AS ENUM ('EMAIL', 'WHATSAPP', 'BOTH');
CREATE TYPE campaign_target AS ENUM ('ALL_CLIENTS', 'ACTIVE_CLIENTS', 'SELECTED_CLIENTS');
CREATE TYPE campaign_status AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE recipient_status AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Admins Table
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Clients Table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    company_name VARCHAR(150),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    domain VARCHAR(255) UNIQUE NOT NULL,
    subdomain VARCHAR(100),
    service_type service_type NOT NULL DEFAULT 'HOSTING_AND_MAINTENANCE',
    plan_interval plan_interval NOT NULL DEFAULT 'MONTHLY',
    amount_per_period DECIMAL(10, 2) NOT NULL DEFAULT 89000.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'CLP',
    
    -- Subscription Lifecycle
    status client_status NOT NULL DEFAULT 'ACTIVE',
    last_payment_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    grace_period_days INT NOT NULL DEFAULT 5,
    
    -- Server file paths & routing
    doc_root VARCHAR(255) NOT NULL,
    caddy_config_path VARCHAR(255),
    ssl_enabled BOOLEAN DEFAULT FALSE,
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment Records Table
CREATE TABLE IF NOT EXISTS payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'CLP',
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'MANUAL_TRANSFER',
    reference_number VARCHAR(100),
    notes TEXT
);

-- Notification Logs Table
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    recipient_email VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL,
    details TEXT
);

-- Operations Tables
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status project_status NOT NULL DEFAULT 'ACTIVE',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'TODO',
    priority task_priority NOT NULL DEFAULT 'MEDIUM',
    estimated_hours DECIMAL(5, 2) DEFAULT 0.00,
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_spent DECIMAL(5, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- COMMUNICATIONS MODULE TABLES
-- ====================================================================

-- 1. Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channel campaign_channel NOT NULL DEFAULT 'BOTH',
    target_audience campaign_target NOT NULL DEFAULT 'ALL_CLIENTS',
    status campaign_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);

-- 2. Campaign Recipients Table
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    channel campaign_channel NOT NULL,
    status recipient_status NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for Communications Module
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recipients_client ON campaign_recipients(client_id);

-- =========================================================
-- INFRASTRUCTURE & MIGRATION ENGINE
-- =========================================================

CREATE TYPE migration_status AS ENUM ('PENDING','ANALYZING','SIMULATING','READY','MIGRATING','COMPLETED','FAILED','ROLLED_BACK');
CREATE TYPE provision_status AS ENUM ('PENDING','PROVISIONING','COMPLETED','FAILED');
CREATE TYPE backup_type AS ENUM ('CPANEL_FULL','WEBSITE_ZIP','DATABASE_SQL','MAIL_BACKUP');
CREATE TYPE project_type_enum AS ENUM ('WORDPRESS','LARAVEL','REACT','NEXTJS','PHP','HTML','NODE','UNKNOWN');
CREATE TYPE risk_severity AS ENUM ('INFO','WARNING','CRITICAL');

CREATE TABLE IF NOT EXISTS migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  domain VARCHAR(255),
  backup_type backup_type NOT NULL,
  backup_path TEXT,
  backup_size_bytes BIGINT,
  detected_project_type project_type_enum DEFAULT 'UNKNOWN',
  analysis_report JSONB,
  simulation_report JSONB,
  migration_score INTEGER,
  status migration_status DEFAULT 'PENDING',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_log TEXT,
  rollback_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS migration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id UUID REFERENCES migrations(id) ON DELETE CASCADE,
  step VARCHAR(100),
  message TEXT,
  status VARCHAR(20) DEFAULT 'RUNNING',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  details JSONB
);

CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  filename VARCHAR(500),
  file_path TEXT,
  file_size BIGINT,
  backup_type backup_type,
  version INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain VARCHAR(255),
  project_type project_type_enum,
  manage_hosting BOOLEAN DEFAULT true,
  manage_email BOOLEAN DEFAULT false,
  email_accounts JSONB,
  status provision_status DEFAULT 'PENDING',
  provision_log JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_migrations_status ON migrations(status);
CREATE INDEX IF NOT EXISTS idx_migration_logs_migration ON migration_logs(migration_id);
CREATE INDEX IF NOT EXISTS idx_backups_client ON backups(client_id);
CREATE INDEX IF NOT EXISTS idx_provisions_client ON provisions(client_id);

CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(100) NOT NULL,
  reference_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  payload JSONB,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'SUCCESS',
  ip VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS server_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpu_usage DECIMAL(5,2),
  ram_total_gb DECIMAL(5,2),
  ram_used_gb DECIMAL(5,2),
  disk_total_gb DECIMAL(5,2),
  disk_used_gb DECIMAL(5,2),
  docker_status VARCHAR(50),
  mailcow_status VARCHAR(50),
  redis_status VARCHAR(50),
  postgres_status VARCHAR(50),
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_server_health_created ON server_health_metrics(created_at);
