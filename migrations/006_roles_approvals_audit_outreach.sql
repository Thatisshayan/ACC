-- Migration 006: Roles, approvals, audit log, outreach leads
-- All statements use IF NOT EXISTS — safe to re-run.

-- ── acc_roles ─────────────────────────────────────────────────────────────────
-- Per-user role grants (operator, admin, user, etc.)
CREATE TABLE IF NOT EXISTS acc_roles (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user',
  granted_by TEXT,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, role)
);

-- ── acc_approvals ─────────────────────────────────────────────────────────────
-- Approval decisions for tasks requiring human sign-off
CREATE TABLE IF NOT EXISTS acc_approvals (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     TEXT REFERENCES acc_tasks(id) ON DELETE SET NULL,
  decision    TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  decided_by  TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  decided_at  TIMESTAMPTZ
);

-- ── acc_audit_log ─────────────────────────────────────────────────────────────
-- Immutable append-only audit trail for security events
CREATE TABLE IF NOT EXISTS acc_audit_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── acc_outreach_leads ────────────────────────────────────────────────────────
-- Lead records for outreach campaigns
CREATE TABLE IF NOT EXISTS acc_outreach_leads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL,
  first_name  TEXT,
  last_name   TEXT,
  company     TEXT,
  title       TEXT,
  source      TEXT,
  campaign_id TEXT,
  status      TEXT NOT NULL DEFAULT 'new', -- new | contacted | replied | unsubscribed | bounced
  score       INT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email, campaign_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_acc_roles_user_id            ON acc_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_acc_approvals_task_id        ON acc_approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_acc_approvals_decision       ON acc_approvals(decision);
CREATE INDEX IF NOT EXISTS idx_acc_audit_log_actor          ON acc_audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_acc_audit_log_created_at     ON acc_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_acc_outreach_leads_email     ON acc_outreach_leads(email);
CREATE INDEX IF NOT EXISTS idx_acc_outreach_leads_campaign  ON acc_outreach_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_acc_outreach_leads_status    ON acc_outreach_leads(status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Enable RLS on all new tables. Policies are set in migration 007.
ALTER TABLE acc_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_approvals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_outreach_leads ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS entirely — these open policies are a temporary
-- placeholder that migration 007 will replace with properly scoped ones.
CREATE POLICY IF NOT EXISTS "service all" ON acc_roles          USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_approvals      USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_audit_log      USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_outreach_leads USING (true) WITH CHECK (true);
