// cloud/orchestrator/snapshots.js
// In-memory snapshot store with disk persistence.
// Survives restarts — swappable to Redis later without changing callers.
'use strict';

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '.snapshots_cache.json');

// ── Load from disk on startup ─────────────────────────────────────────────────
const snapshots = new Map();

function _loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw  = fs.readFileSync(CACHE_FILE, 'utf8');
      const data = JSON.parse(raw);
      for (const [k, v] of Object.entries(data)) {
        snapshots.set(k, v);
      }
      console.log(`[snapshots] Restored ${snapshots.size} snapshots from disk.`);
    }
  } catch (e) {
    console.warn('[snapshots] Could not load cache:', e.message);
  }
}

function _saveToDisk() {
  try {
    const obj = {};
    for (const [k, v] of snapshots.entries()) obj[k] = v;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.warn('[snapshots] Could not persist cache:', e.message);
  }
}

// Load immediately on require
_loadFromDisk();

// ── Public API ────────────────────────────────────────────────────────────────

function saveSnapshot(snapshotId, data) {
  if (!snapshotId) throw new Error('snapshotId is required');
  snapshots.set(snapshotId, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
  _saveToDisk();
}

function loadSnapshot(snapshotId) {
  if (!snapshotId) return null;
  return snapshots.get(snapshotId) || null;
}

function updateNodeInSnapshot(snapshotId, nodeId, patch) {
  const snap = snapshots.get(snapshotId);
  if (!snap) return;

  const nodes = snap.nodes || [];
  const idx   = nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) return;

  nodes[idx] = {
    ...nodes[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  snapshots.set(snapshotId, {
    ...snap,
    nodes,
    updatedAt: new Date().toISOString(),
  });
  _saveToDisk();
}

function getNodeOutputs(snapshotId, nodeIds) {
  const snap = snapshots.get(snapshotId);
  if (!snap) return [];
  return (snap.nodes || [])
    .filter(n => nodeIds.includes(n.id))
    .map(n => n.result);
}

function deleteSnapshot(snapshotId) {
  snapshots.delete(snapshotId);
  _saveToDisk();
}

module.exports = {
  saveSnapshot,
  loadSnapshot,
  updateNodeInSnapshot,
  getNodeOutputs,
  deleteSnapshot,
  snapshots,
};
