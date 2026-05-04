// cloud/utils/auditLog.js
// Per-node audit trail: actorRole, timestamp, inputs, outputs.
// Stored in memory + can be persisted to LTM/ClickUp.

const auditTrail = [];

/**
 * logNodeRun
 * Records a node execution to the audit trail.
 *
 * @param {Object} params
 * @param {string} params.nodeId
 * @param {string} params.agentType
 * @param {string} params.actorRole    - role that triggered the node
 * @param {string} params.snapshotId
 * @param {Object} params.payload      - node input (sanitized)
 * @param {Object} params.result       - node output
 * @param {string} params.status       - "completed" | "failed" | "rejected"
 */
function logNodeRun({ nodeId, agentType, actorRole, snapshotId, payload, result, status }) {
  const entry = {
    id:          auditTrail.length + 1,
    nodeId,
    agentType,
    actorRole:   actorRole || "unknown",
    snapshotId:  snapshotId || null,
    status,
    // Sanitize: never log raw API keys or sensitive tokens
    payload:     sanitizePayload(payload),
    result:      sanitizeResult(result),
    timestamp:   new Date().toISOString(),
  };

  auditTrail.push(entry);
  return entry;
}

/**
 * getAuditTrail
 * @param {number} limit
 * @returns {Array}
 */
function getAuditTrail(limit = 500) {
  return auditTrail.slice(-limit);
}

/**
 * getAuditByNode
 */
function getAuditByNode(nodeId) {
  return auditTrail.filter(e => e.nodeId === nodeId);
}

/**
 * getAuditByRole
 */
function getAuditByRole(role) {
  return auditTrail.filter(e => e.actorRole === role);
}

// ── Sanitization helpers ──────────────────────────────────────────────────────

function sanitizePayload(payload) {
  if (!payload) return null;
  const safe = { ...payload };
  // Strip any key that looks like a secret
  for (const key of Object.keys(safe)) {
    if (/key|token|secret|password|credential/i.test(key)) {
      safe[key] = "[REDACTED]";
    }
  }
  return safe;
}

function sanitizeResult(result) {
  if (!result) return null;
  // Only keep top-level success/error/output — drop raw API responses
  return {
    success: result.success,
    error:   result.error   || null,
    hasOutput: !!result.output,
  };
}

module.exports = { logNodeRun, getAuditTrail, getAuditByNode, getAuditByRole };
