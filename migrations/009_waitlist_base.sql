-- Migration 009: Ensure waitlist base table exists

CREATE TABLE IF NOT EXISTS acc_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  automate    TEXT,
  role        TEXT,
  control     TEXT,
  source      TEXT NOT NULL DEFAULT 'landing',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_waitlist_email      ON acc_waitlist(email);
CREATE INDEX IF NOT EXISTS idx_acc_waitlist_created_at ON acc_waitlist(created_at);

ALTER TABLE acc_waitlist ENABLE ROW LEVEL SECURITY;
