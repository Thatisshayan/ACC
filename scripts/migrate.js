'use strict';
// scripts/migrate.js — runs any migrations not yet applied
// Usage: node scripts/migrate.js
//        or: called from start.js on boot

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

const fs   = require('fs');
const path = require('path');

let _createClient = null;
try { _createClient = require('@supabase/supabase-js').createClient; }
catch (_) { console.warn('[migrate] @supabase/supabase-js not installed — auto-migrations disabled.'); }

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function isConfigured() {
  return _createClient &&
         SUPABASE_URL &&
         SUPABASE_KEY &&
         !SUPABASE_URL.includes('change_me') &&
         !SUPABASE_KEY.includes('change_me');
}

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

async function ensureMigrationsTable(db) {
  const { error } = await db.rpc('exec_sql', {
    sql: `CREATE TABLE IF NOT EXISTS acc_migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ DEFAULT now()
    );`
  }).single();

  // rpc may not exist — fall back to direct query via REST
  if (error) {
    const { error: e2 } = await db.from('acc_migrations').select('id').limit(1);
    if (e2 && e2.code === '42P01') {
      console.error('[migrate] Cannot auto-create acc_migrations table via REST API.');
      console.error('[migrate] Run this SQL in the Supabase SQL Editor first:');
      console.error('  CREATE TABLE IF NOT EXISTS acc_migrations (id SERIAL PRIMARY KEY, filename TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT now());');
      throw new Error('Migrations table missing and auto-creation failed.');
    }
  }
}

async function getApplied(db) {
  const { data, error } = await db.from('acc_migrations').select('filename');
  if (error) throw new Error('Cannot read acc_migrations: ' + error.message);
  return new Set((data || []).map(r => r.filename));
}

async function applyMigration(db, filename, sql) {
  console.log(`[migrate] Applying ${filename}…`);
  const { error } = await db.rpc('exec_sql', { sql }).single().catch(() => ({ error: { message: 'rpc not available' } }));
  if (error) {
    console.error(`[migrate] Failed to apply ${filename}:`, error.message);
    console.error(`[migrate] Run this SQL manually in the Supabase SQL Editor:`);
    console.error('  File:', path.join(MIGRATIONS_DIR, filename));
    return false;
  }
  await db.from('acc_migrations').insert({ filename });
  console.log(`[migrate] ✓ ${filename} applied.`);
  return true;
}

async function run() {
  if (!isConfigured()) {
    console.log('[migrate] Supabase not fully configured; skipping auto-migrations.');
    return;
  }

  const db = _createClient(SUPABASE_URL, SUPABASE_KEY);
  await ensureMigrationsTable(db);

  const applied = await getApplied(db);
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const ok = await applyMigration(db, file, sql);
    if (ok) count++;
  }

  if (count === 0) {
    console.log('[migrate] All migrations already applied.');
  } else {
    console.log(`[migrate] ${count} migration(s) applied.`);
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch(e => {
    console.error('[migrate] Fatal:', e.message);
    process.exit(1);
  });
}
