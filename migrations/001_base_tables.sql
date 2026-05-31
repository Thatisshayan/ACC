-- Migration 001: Base ACC tables
-- acc_tasks, acc_results, acc_users

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS acc_tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  assigned_agent TEXT,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_used TEXT
);

CREATE TABLE IF NOT EXISTS acc_results (
  id               TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL REFERENCES acc_tasks(id) ON DELETE CASCADE,
  provider_used    TEXT,
  is_real_ai_result BOOLEAN DEFAULT FALSE,
  cost_tier        TEXT,
  output           TEXT,
  summary          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_users (
  user_id    TEXT PRIMARY KEY,
  name       TEXT,
  language   TEXT DEFAULT 'en',
  state      TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_tasks_status         ON acc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_acc_tasks_assigned_agent ON acc_tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_acc_results_task_id      ON acc_results(task_id);
CREATE INDEX IF NOT EXISTS idx_acc_users_state          ON acc_users(state);

ALTER TABLE acc_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_users    ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service all" ON acc_tasks    USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_results  USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_users    USING (true) WITH CHECK (true);
