-- Migration 004: Email monitoring — per-user IMAP credentials + sent tracking

CREATE TABLE IF NOT EXISTS acc_email_credentials (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT NOT NULL,
  provider    TEXT NOT NULL DEFAULT 'gmail',
  imap_host   TEXT NOT NULL DEFAULT 'imap.gmail.com',
  imap_port   INT  NOT NULL DEFAULT 993,
  email       TEXT NOT NULL,
  -- app password stored encrypted; use Supabase Vault or AES-256 before insert
  password_enc TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  last_polled TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS acc_sent_emails (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  to_address   TEXT NOT NULL,
  subject      TEXT,
  campaign_id  TEXT,
  sent_at      TIMESTAMPTZ DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'sent',
  opened_at    TIMESTAMPTZ,
  unsubscribed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_acc_email_creds_user  ON acc_email_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_acc_sent_emails_to    ON acc_sent_emails(to_address);
CREATE INDEX IF NOT EXISTS idx_acc_sent_emails_camp  ON acc_sent_emails(campaign_id);

ALTER TABLE acc_email_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_sent_emails       ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service all" ON acc_email_credentials USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_sent_emails       USING (true) WITH CHECK (true);
