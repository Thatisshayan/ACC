-- Migration 003: Ensure acc_waitlist exists, then add qualification columns.
-- Note: this CREATE TABLE only captures the base shape (id, email, source,
-- created_at). The automate/role/control columns are added by the ALTER TABLE
-- statements below, so they are not repeated in the CREATE TABLE. On a fresh
-- Supabase project 003 runs before 009, which is why the guarded CREATE TABLE
-- is idempotent here; 009's CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS / ENABLE ROW LEVEL SECURITY then no-ops cleanly when it runs later.

CREATE TABLE IF NOT EXISTS acc_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL DEFAULT 'landing',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS automate TEXT;
ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS role     TEXT;
ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS control  TEXT;
