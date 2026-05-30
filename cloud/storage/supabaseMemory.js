'use strict';
// cloud/storage/supabaseMemory.js — Supabase-backed memory persistence
// Wraps the memory/store.js SQLite layer with Supabase cloud sync.
// Write-through: SQLite stays local (fast), Supabase is authoritative on restart.
//
// Supabase tables required (run in Supabase SQL editor):
// ─────────────────────────────────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS acc_agent_memory (
//   id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   scope      TEXT NOT NULL DEFAULT 'global',
//   key        TEXT NOT NULL,
//   value      TEXT NOT NULL,
//   source     TEXT NOT NULL DEFAULT 'system',
//   importance INT NOT NULL DEFAULT 5,
//   created_at TIMESTAMPTZ DEFAULT now(),
//   updated_at TIMESTAMPTZ DEFAULT now(),
//   expires_at TIMESTAMPTZ,
//   UNIQUE(scope, key)
// );
// ALTER TABLE acc_agent_memory ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "service all" ON acc_agent_memory USING (true) WITH CHECK (true);
//
// CREATE TABLE IF NOT EXISTS acc_card_requests (
//   id             UUID PRIMARY KEY,
//   agent          TEXT NOT NULL,
//   purpose        TEXT NOT NULL,
//   amount         NUMERIC NOT NULL,
//   amount_cents   INT NOT NULL,
//   merchant       TEXT,
//   status         TEXT NOT NULL DEFAULT 'pending',
//   card_data      JSONB,
//   created_at     TIMESTAMPTZ DEFAULT now(),
//   updated_at     TIMESTAMPTZ DEFAULT now()
// );
// ALTER TABLE acc_card_requests ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "service all" ON acc_card_requests USING (true) WITH CHECK (true);
//
// CREATE TABLE IF NOT EXISTS acc_subscriptions (
//   id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   email                  TEXT UNIQUE NOT NULL,
//   tier                   TEXT NOT NULL DEFAULT 'starter',
//   stripe_customer_id     TEXT,
//   stripe_subscription_id TEXT,
//   status                 TEXT NOT NULL DEFAULT 'active',
//   created_at             TIMESTAMPTZ DEFAULT now(),
//   updated_at             TIMESTAMPTZ DEFAULT now()
// );
// ALTER TABLE acc_subscriptions ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "service all" ON acc_subscriptions USING (true) WITH CHECK (true);
// ─────────────────────────────────────────────────────────────────────────────

const { log } = require('../utils/logger.js');

// Lazy + safe — Railway may not have @supabase/supabase-js in node_modules
// even if it's in package.json (Docker layer cache issue). Treat as optional.
let _createClient = null;
try { _createClient = require('@supabase/supabase-js').createClient; }
catch (_) { log('[supabaseMemory] @supabase/supabase-js not available — cloud sync disabled.'); }

function db() {
  if (!_createClient) return null;
  const url = (process.env.SUPABASE_URL || '').trim();
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return _createClient(url, key);
}

// ── Memory ────────────────────────────────────────────────────────────────────

async function syncMemoryToSupabase(rows) {
  const client = db();
  if (!client || !rows.length) return;
  try {
    const { error } = await client.from('acc_agent_memory').upsert(
      rows.map(r => ({
        scope:      r.scope,
        key:        r.key,
        value:      typeof r.value === 'string' ? r.value : JSON.stringify(r.value),
        source:     r.source || 'system',
        importance: r.importance || 5,
        expires_at: r.expires_at || null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'scope,key' }
    );
    if (error) log('[supabaseMemory] upsert error:', error.message);
  } catch (e) {
    log('[supabaseMemory] sync error:', e.message);
  }
}

async function loadMemoryFromSupabase(scope) {
  const client = db();
  if (!client) return [];
  try {
    const query = client.from('acc_agent_memory').select('*').order('importance', { ascending: false });
    if (scope) query.eq('scope', scope);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    log('[supabaseMemory] load error:', e.message);
    return [];
  }
}

// ── Card requests ─────────────────────────────────────────────────────────────

async function saveCardRequest(request) {
  const client = db();
  if (!client) return;
  try {
    const { error } = await client.from('acc_card_requests').upsert({
      id:           request.id,
      agent:        request.agent,
      purpose:      request.purpose,
      amount:       request.amount,
      amount_cents: request.amountCents,
      merchant:     request.merchant || null,
      status:       request.status,
      card_data:    request.card || null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) log('[supabaseMemory] saveCardRequest error:', error.message);
  } catch (e) {
    log('[supabaseMemory] saveCardRequest error:', e.message);
  }
}

async function loadCardRequests() {
  const client = db();
  if (!client) return [];
  try {
    const { data, error } = await client.from('acc_card_requests').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    log('[supabaseMemory] loadCardRequests error:', e.message);
    return [];
  }
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

async function saveSubscription(sub) {
  const client = db();
  if (!client) return;
  try {
    const { error } = await client.from('acc_subscriptions').upsert({
      email:                  sub.email.toLowerCase(),
      tier:                   sub.tier,
      stripe_customer_id:     sub.stripeCustomerId || null,
      stripe_subscription_id: sub.stripeSubscriptionId || null,
      status:                 sub.status,
      updated_at:             new Date().toISOString(),
    }, { onConflict: 'email' });
    if (error) log('[supabaseMemory] saveSubscription error:', error.message);
  } catch (e) {
    log('[supabaseMemory] saveSubscription error:', e.message);
  }
}

async function loadSubscriptions() {
  const client = db();
  if (!client) return [];
  try {
    const { data, error } = await client.from('acc_subscriptions').select('*');
    if (error) throw error;
    return data || [];
  } catch (e) {
    log('[supabaseMemory] loadSubscriptions error:', e.message);
    return [];
  }
}

module.exports = {
  syncMemoryToSupabase,
  loadMemoryFromSupabase,
  saveCardRequest,
  loadCardRequests,
  saveSubscription,
  loadSubscriptions,
};
