// cloud/dlq/handler.js
// Dead Letter Queue — persists permanently failed nodes to disk.
// Each DLQ item is a JSON file in cloud/dlq/items/
'use strict';

const fs   = require('fs');
const path = require('path');

const DLQ_DIR = path.join(__dirname, 'items');
if (!fs.existsSync(DLQ_DIR)) fs.mkdirSync(DLQ_DIR, { recursive: true });

/**
 * writeToDLQ
 * Persists a failed node to the DLQ.
 * @param {{ graphId, node, context, error }} params
 * @returns {{ id: string, path: string }}
 */
function writeToDLQ({ graphId, node, context, error }) {
  const id        = `dlq_${Date.now()}_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const filePath  = path.join(DLQ_DIR, `${id}.json`);

  const record = {
    id,
    graphId,
    nodeId:     node.id,
    nodeType:   node.type,
    payload:    node.payload,
    metadata:   node.metadata || {},
    attempts:   node.attempts || 0,
    lastError:  error || node.lastError || 'unknown',
    context,                          // already redacted by caller
    failedAt:   new Date().toISOString(),
    requeuedAt: null,
    status:     'failed',             // failed | requeued | resolved
  };

  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  return { id, path: filePath };
}

/**
 * listDLQ
 * Returns all DLQ items (metadata only, no full payload).
 */
function listDLQ() {
  const files = fs.readdirSync(DLQ_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      const raw    = fs.readFileSync(path.join(DLQ_DIR, f), 'utf8');
      const record = JSON.parse(raw);
      return {
        id:        record.id,
        graphId:   record.graphId,
        nodeId:    record.nodeId,
        nodeType:  record.nodeType,
        attempts:  record.attempts,
        lastError: record.lastError,
        failedAt:  record.failedAt,
        status:    record.status,
      };
    } catch (_) { return null; }
  }).filter(Boolean);
}

/**
 * getDLQItem
 * Returns a single DLQ item by id (full record).
 */
function getDLQItem(id) {
  const filePath = path.join(DLQ_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) { return null; }
}

/**
 * markRequeued
 * Updates status to 'requeued' without deleting (audit trail).
 */
function markRequeued(id) {
  const filePath = path.join(DLQ_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return false;
  const record     = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  record.status     = 'requeued';
  record.requeuedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  return true;
}

/**
 * deleteDLQItem
 * Permanently removes a DLQ item.
 */
function deleteDLQItem(id) {
  const filePath = path.join(DLQ_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

module.exports = { writeToDLQ, listDLQ, getDLQItem, markRequeued, deleteDLQItem };
