-- Migration 002: Memory, card requests, subscriptions

CREATE TABLE IF NOT EXISTS acc_agent_memory (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scope      TEXT NOT NULL DEFAULT 'global',
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'system',
  importance INT  NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(scope, key)
);

CREATE TABLE IF NOT EXISTS acc_card_requests (
  id           UUID PRIMARY KEY,
  agent        TEXT NOT NULL,
  purpose      TEXT NOT NULL,
  amount       NUMERIC NOT NULL,
  amount_cents INT NOT NULL,
  merchant     TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  card_data    JSONB,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acc_subscriptions (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email                  TEXT UNIQUE NOT NULL,
  tier                   TEXT NOT NULL DEFAULT 'starter',
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE acc_agent_memory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_card_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service all" ON acc_agent_memory  USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_card_requests USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service all" ON acc_subscriptions USING (true) WITH CHECK (true);
