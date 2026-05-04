// cloud/security/ephemeralSnapshots.js
// Ephemeral snapshot store with disk persistence + 7-day TTL.
// Snapshots are NEVER persisted to LTM until Shayan approves.

const fs   = require("fs");
const path = require("path");

const STORE_DIR      = path.join(__dirname, ".ephemeral_store");
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (!fs.existsSync(STORE_DIR)) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

const store = new Map(); // id → record

// ── Disk helpers ──────────────────────────────────────────────────────────────

function persistToDisk(id, record) {
  try {
    fs.writeFileSync(path.join(STORE_DIR, `${id}.json`), JSON.stringify(record));
  } catch (e) {
    console.warn("[ephemeralSnapshots] persist failed:", e.message);
  }
}

function removeFromDisk(id) {
  try {
    const file = path.join(STORE_DIR, `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) {
    console.warn("[ephemeralSnapshots] remove failed:", e.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * createSnapshot
 * @param {{ data: any, meta?: Object, ttlMs?: number }}
 * @returns {Object} snapshot record
 */
function createSnapshot({ data, meta = {}, ttlMs = DEFAULT_TTL_MS }) {
  const id        = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Date.now() + ttlMs;
  const record    = {
    id,
    data,
    meta,
    createdAt:       Date.now(),
    expiresAt,
    pendingApproval: true,
    approvedAt:      null,
  };

  store.set(id, record);
  persistToDisk(id, record);

  // Auto-purge after TTL
  setTimeout(() => {
    const r = store.get(id);
    if (r && Date.now() >= r.expiresAt) {
      store.delete(id);
      removeFromDisk(id);
    }
  }, ttlMs + 1000);

  return record;
}

/** getSnapshot */
function getSnapshot(id) {
  return store.get(id) || null;
}

/** listSnapshots */
function listSnapshots() {
  return [...store.values()];
}

/** listPendingSnapshots */
function listPendingSnapshots() {
  return [...store.values()].filter(r => r.pendingApproval);
}

/** deleteSnapshot */
function deleteSnapshot(id) {
  store.delete(id);
  removeFromDisk(id);
  return true;
}

/**
 * approveSnapshot
 * Marks as approved — caller must then persist to LTM/Notion.
 */
function approveSnapshot(id) {
  const rec = store.get(id);
  if (!rec) return null;
  rec.pendingApproval = false;
  rec.approvedAt      = Date.now();
  persistToDisk(id, rec);
  return rec;
}

module.exports = {
  createSnapshot,
  getSnapshot,
  listSnapshots,
  listPendingSnapshots,
  deleteSnapshot,
  approveSnapshot,
};
