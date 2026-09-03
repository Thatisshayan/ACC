'use strict';
// cloud/memory/store.js — ACC persistent memory (SQLite-backed)
// Stores facts, context, app states, and conversation history
// ACC reads this before acting; writes after key events

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '../../data/memory');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'memory.sqlite3'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id         TEXT PRIMARY KEY,
    scope      TEXT NOT NULL DEFAULT 'global',
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'system',
    importance INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_scope_key ON memories(scope, key);
  CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
  CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);

  CREATE TABLE IF NOT EXISTS memory_events (
    id         TEXT PRIMARY KEY,
    scope      TEXT NOT NULL DEFAULT 'global',
    event_type TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',
    source     TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_scope ON memory_events(scope);
  CREATE INDEX IF NOT EXISTS idx_events_type  ON memory_events(event_type);
`);

const { v4: uuid } = require('uuid');

// ── L1 Cache (Task 19) ────────────────────────────────────────────────────────
// Bounded, insertion-order Map used as a simple LRU: a get() re-inserts the
// entry to mark it most-recently-used, and set() evicts the oldest entry
// once the cap is exceeded — prevents unbounded memory growth.
const L1_MAX_ENTRIES = 5000;
const l1Cache = new Map();

// JSON.stringify-per-segment keeps scope/key boundaries unambiguous — a raw
// `${scope}:${key}` join lets ("global", "a:b") and ("global:a", "b") collide
// on the same string, aliasing two distinct memory records in the cache.
function l1Key(scope, key) {
  return `${JSON.stringify(scope || 'global')}::${JSON.stringify(key)}`;
}
function l1ScopePrefix(scope) {
  return `${JSON.stringify(scope || 'global')}::`;
}

function getL1(scope, key) {
  const cacheKey = l1Key(scope, key);
  const entry = l1Cache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
    l1Cache.delete(cacheKey);
    return null;
  }
  // Refresh recency: delete + re-set moves the key to the end of Map's
  // iteration order.
  l1Cache.delete(cacheKey);
  l1Cache.set(cacheKey, entry);
  return entry.value;
}

function setL1(scope, key, value, expiresAt) {
  const cacheKey = l1Key(scope, key);
  l1Cache.delete(cacheKey);
  l1Cache.set(cacheKey, { value, expiresAt });
  while (l1Cache.size > L1_MAX_ENTRIES) {
    const oldestKey = l1Cache.keys().next().value;
    l1Cache.delete(oldestKey);
  }
}

function deleteL1(scope, key) {
  l1Cache.delete(l1Key(scope, key));
}

function clearL1Scope(scope) {
  const prefix = l1ScopePrefix(scope);
  for (const k of l1Cache.keys()) {
    if (k.startsWith(prefix)) {
      l1Cache.delete(k);
    }
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

function remember(scope, key, value, opts) {
  var o = opts || {};
  var id = uuid();
  var val = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(`
    INSERT INTO memories (id, scope, key, value, source, importance, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope, key) DO UPDATE SET
      value      = excluded.value,
      source     = excluded.source,
      importance = excluded.importance,
      updated_at = datetime('now'),
      expires_at = excluded.expires_at
  `).run(id, scope || 'global', key, val, o.source || 'system', o.importance || 5, o.expiresAt || null);

  // Cache the serialized string (`val`), not the caller's object reference —
  // a caller mutating its own object after this call must not silently
  // mutate what future recall() calls return.
  setL1(scope, key, val, o.expiresAt || null);

  return { scope, key, value: val };
}

// ── Read ──────────────────────────────────────────────────────────────────────

function parseStoredValue(raw) {
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

function recall(scope, key) {
  const cachedRaw = getL1(scope, key);
  if (cachedRaw !== null) return parseStoredValue(cachedRaw);

  var row = db.prepare(`
    SELECT * FROM memories
    WHERE scope = ? AND key = ?
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(scope || 'global', key);
  if (!row) return null;

  setL1(scope, key, row.value, row.expires_at || null);

  return parseStoredValue(row.value);
}

function recallAll(scope, opts) {
  var o = opts || {};
  var limit = o.limit || 50;
  var minImportance = o.minImportance || 1;
  var rows = db.prepare(`
    SELECT * FROM memories
    WHERE scope = ?
      AND importance >= ?
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY importance DESC, updated_at DESC
    LIMIT ?
  `).all(scope || 'global', minImportance, limit);
  return rows.map(function(r) {
    var val;
    try { val = JSON.parse(r.value); } catch (_) { val = r.value; }
    return Object.assign({}, r, { value: val });
  });
}

function search(query, opts) {
  var o = opts || {};
  var limit = o.limit || 20;
  var scope = o.scope;
  // SQLite's LIKE has no default escape character — "\%" only means "escaped %"
  // if the query itself declares ESCAPE '\'. Without that clause (missing below
  // until now), the old `.replace(/%/g, '\\%')` was a no-op: a literal "%" in a
  // search term still acted as a wildcard, and "_" (SQLite's single-char wildcard)
  // wasn't escaped at all either. Escape the escape character first, then both
  // wildcards, and declare ESCAPE '\' so the escaping is actually honored.
  var escaped = String(query).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  var pattern = '%' + escaped + '%';
  var rows = scope
    ? db.prepare(`SELECT * FROM memories WHERE scope = ? AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\') AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY importance DESC LIMIT ?`).all(scope, pattern, pattern, limit)
    : db.prepare(`SELECT * FROM memories WHERE (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\') AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY importance DESC LIMIT ?`).all(pattern, pattern, limit);
  return rows.map(function(r) {
    var val;
    try { val = JSON.parse(r.value); } catch (_) { val = r.value; }
    return Object.assign({}, r, { value: val });
  });
}

// ── Events (append-only log) ──────────────────────────────────────────────────

function logEvent(scope, eventType, payload, source) {
  db.prepare(`INSERT INTO memory_events (id, scope, event_type, payload, source) VALUES (?, ?, ?, ?, ?)`)
    .run(uuid(), scope || 'global', eventType, JSON.stringify(payload || {}), source || 'system');
}

function getEvents(scope, opts) {
  var o = opts || {};
  var limit = o.limit || 50;
  var eventType = o.eventType;
  var rows = eventType
    ? db.prepare(`SELECT * FROM memory_events WHERE scope = ? AND event_type = ? ORDER BY created_at DESC LIMIT ?`).all(scope || 'global', eventType, limit)
    : db.prepare(`SELECT * FROM memory_events WHERE scope = ? ORDER BY created_at DESC LIMIT ?`).all(scope || 'global', limit);
  return rows.map(function(r) {
    var p;
    try { p = JSON.parse(r.payload); } catch (_) { p = {}; }
    return Object.assign({}, r, { payload: p });
  });
}

// ── Forget ────────────────────────────────────────────────────────────────────

function forget(scope, key) {
  deleteL1(scope, key);
  var info = db.prepare(`DELETE FROM memories WHERE scope = ? AND key = ?`).run(scope || 'global', key);
  return info.changes > 0;
}

function forgetScope(scope) {
  clearL1Scope(scope);
  var info = db.prepare(`DELETE FROM memories WHERE scope = ?`).run(scope || 'global');
  return info.changes;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function stats() {
  var total   = db.prepare(`SELECT COUNT(*) as n FROM memories WHERE (expires_at IS NULL OR expires_at > datetime('now'))`).get().n;
  var scopes  = db.prepare(`SELECT scope, COUNT(*) as n FROM memories GROUP BY scope ORDER BY n DESC`).all();
  var events  = db.prepare(`SELECT COUNT(*) as n FROM memory_events`).get().n;
  return { total_memories: total, scopes, total_events: events };
}

function exportScope(scope) {
  var rows = db.prepare(`
    SELECT * FROM memories
    WHERE scope = ?
    ORDER BY updated_at DESC
  `).all(scope || 'global');
  return rows.map(function(r) {
    var val;
    try { val = JSON.parse(r.value); } catch (_) { val = r.value; }
    return Object.assign({}, r, { value: val });
  });
}

function pruneExpired() {
  var mem = db.prepare(`DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`).run().changes;
  return { deleted_memories: mem };
}

module.exports = { remember, recall, recallAll, search, logEvent, getEvents, forget, forgetScope, stats, exportScope, pruneExpired };
