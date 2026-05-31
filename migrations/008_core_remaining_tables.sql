-- Migration 008: Remaining core auth/product tables from Agent 1 task list
-- Safe to re-run with IF NOT EXISTS.

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  device       TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_acc_sessions_user_id   ON acc_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_acc_sessions_expires   ON acc_sessions(expires_at);

-- ── Connected Accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_connected_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  provider        TEXT NOT NULL,
  account_ref     TEXT NOT NULL,
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  encrypted_token TEXT,
  status          TEXT NOT NULL DEFAULT 'connected',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, account_ref)
);
CREATE INDEX IF NOT EXISTS idx_acc_connected_accounts_user     ON acc_connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_acc_connected_accounts_provider ON acc_connected_accounts(provider);

-- ── Rate Limits ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_rate_limits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_key   TEXT NOT NULL,
  bucket        TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  window_end    TIMESTAMPTZ NOT NULL,
  usage_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_key, bucket, window_start)
);
CREATE INDEX IF NOT EXISTS idx_acc_rate_limits_subject ON acc_rate_limits(subject_key, bucket);

-- ── Feature Usage ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_feature_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT,
  feature_key   TEXT NOT NULL,
  provider_used TEXT,
  units         NUMERIC NOT NULL DEFAULT 1,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acc_feature_usage_user    ON acc_feature_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_acc_feature_usage_feature ON acc_feature_usage(feature_key);

-- ── Media Assets ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_media_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      TEXT,
  asset_type    TEXT NOT NULL,
  storage_key   TEXT NOT NULL UNIQUE,
  public_url    TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_acc_media_assets_owner ON acc_media_assets(owner_id);

-- ── Job Applications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_job_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT,
  role_title       TEXT NOT NULL,
  company          TEXT,
  source           TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',
  applied_at       TIMESTAMPTZ,
  external_ref     TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acc_job_applications_user   ON acc_job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_acc_job_applications_status ON acc_job_applications(status);

-- ── Suppression List ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_suppression_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  reason        TEXT NOT NULL DEFAULT 'unsubscribe',
  source        TEXT NOT NULL DEFAULT 'system',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acc_suppression_list_email ON acc_suppression_list(email);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE acc_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_connected_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_rate_limits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_feature_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_media_assets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_job_applications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_suppression_list    ENABLE ROW LEVEL SECURITY;
