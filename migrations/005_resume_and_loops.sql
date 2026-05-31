-- Migration 005: Resume storage + autonomy loops

CREATE TABLE IF NOT EXISTS acc_resumes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE,
  filename   TEXT NOT NULL,
  content    TEXT NOT NULL,  -- base64-encoded or raw text depending on format
  mime_type  TEXT NOT NULL DEFAULT 'application/pdf',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acc_autonomy_loops (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  goal        TEXT NOT NULL,
  agent       TEXT NOT NULL DEFAULT 'alphonso',
  interval_ms INT  NOT NULL DEFAULT 3600000,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  last_run    TIMESTAMPTZ,
  next_run    TIMESTAMPTZ,
  run_count   INT NOT NULL DEFAULT 0,
  fail_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acc_loop_runs (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loop_id   UUID NOT NULL REFERENCES acc_autonomy_loops(id) ON DELETE CASCADE,
  status    TEXT NOT NULL DEFAULT 'pending',
  output    TEXT,
  error     TEXT,
  started_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_acc_loop_runs_loop_id ON acc_loop_runs(loop_id);

ALTER TABLE acc_resumes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_autonomy_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_loop_runs      ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service all" ON acc_resumes        USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_autonomy_loops USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_loop_runs      USING (true) WITH CHECK (true);
