// cloud/roles/approvalQueue.js
// Holds nodes that require Operator/Admin approval before execution.
// In-memory; can be backed by Supabase/Notion later.

const { logEvent } = require("../logs/logger.js");

const pendingApprovals = new Map(); // approvalId → approval record

/**
 * queueForApproval
 * Puts a node into pending approval state.
 * @param {string} snapshotId
 * @param {Object} node          - full TaskNode
 * @param {string} requesterRole - role that triggered the node
 * @returns {Object} approval record
 */
function queueForApproval(snapshotId, node, requesterRole) {
  const approvalId = `${snapshotId}::${node.id}::${Date.now()}`;

  const record = {
    approvalId,
    snapshotId,
    nodeId:        node.id,
    agentType:     node.agentType,
    payload:       node.payload,
    meta:          node.meta,
    requesterRole,
    status:        "pendingApproval", // pendingApproval | approved | rejected
    createdAt:     new Date().toISOString(),
    resolvedAt:    null,
    resolvedBy:    null,
  };

  pendingApprovals.set(approvalId, record);

  logEvent("approval_queued", `Node ${node.id} queued for approval`, {
    approvalId, snapshotId, nodeId: node.id, requesterRole,
  });

  return record;
}

/**
 * approveNode
 * @param {string} approvalId
 * @param {string} approverRole
 * @returns {Object|null}
 */
function approveNode(approvalId, approverRole) {
  const record = pendingApprovals.get(approvalId);
  if (!record) return null;

  record.status     = "approved";
  record.resolvedAt = new Date().toISOString();
  record.resolvedBy = approverRole;
  pendingApprovals.set(approvalId, record);

  logEvent("approval_granted", `Node ${record.nodeId} approved`, {
    approvalId, approverRole,
  });

  return record;
}

/**
 * rejectNode
 * @param {string} approvalId
 * @param {string} approverRole
 * @returns {Object|null}
 */
function rejectNode(approvalId, approverRole) {
  const record = pendingApprovals.get(approvalId);
  if (!record) return null;

  record.status     = "rejected";
  record.resolvedAt = new Date().toISOString();
  record.resolvedBy = approverRole;
  pendingApprovals.set(approvalId, record);

  logEvent("approval_rejected", `Node ${record.nodeId} rejected`, {
    approvalId, approverRole,
  });

  return record;
}

/**
 * getPendingApprovals
 * Returns all unresolved approval records.
 */
function getPendingApprovals() {
  return [...pendingApprovals.values()].filter(r => r.status === "pendingApproval");
}

/**
 * getApproval
 */
function getApproval(approvalId) {
  return pendingApprovals.get(approvalId) || null;
}

module.exports = {
  queueForApproval,
  approveNode,
  rejectNode,
  getPendingApprovals,
  getApproval,
  pendingApprovals,
};
