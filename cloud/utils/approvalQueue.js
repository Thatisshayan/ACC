// cloud/utils/approvalQueue.js
// In-memory pending approval queue + Telegram notification stub.
// Nodes with requiresApproval:true are held here until an Operator/Admin approves.

const pendingApprovals = new Map(); // approvalId → approval record

let approvalCounter = 0;

/**
 * queueForApproval
 * Adds a node to the approval queue and returns an approvalId.
 *
 * @param {Object} node       - the TaskNode requiring approval
 * @param {string} snapshotId - so the approver can resume the graph
 * @param {string} requestedBy
 * @returns {string} approvalId
 */
function queueForApproval(node, snapshotId, requestedBy) {
  approvalCounter += 1;
  const approvalId = `approval-${approvalCounter}`;

  const record = {
    approvalId,
    snapshotId,
    node,
    requestedBy,
    status:    "pending",  // pending | approved | rejected
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
  };

  pendingApprovals.set(approvalId, record);
  notifyOperator(record);
  return approvalId;
}

/**
 * approveNode
 * Operator/Admin approves a pending node.
 * @param {string} approvalId
 * @param {string} resolvedBy - role or userId
 * @returns {Object|null}
 */
function approveNode(approvalId, resolvedBy = "Operator") {
  const record = pendingApprovals.get(approvalId);
  if (!record) return null;
  record.status     = "approved";
  record.resolvedAt = new Date().toISOString();
  record.resolvedBy = resolvedBy;
  pendingApprovals.set(approvalId, record);
  return record;
}

/**
 * rejectNode
 */
function rejectNode(approvalId, resolvedBy = "Operator") {
  const record = pendingApprovals.get(approvalId);
  if (!record) return null;
  record.status     = "rejected";
  record.resolvedAt = new Date().toISOString();
  record.resolvedBy = resolvedBy;
  pendingApprovals.set(approvalId, record);
  return record;
}

/**
 * getPendingApprovals
 */
function getPendingApprovals() {
  return [...pendingApprovals.values()].filter(r => r.status === "pending");
}

/**
 * getApproval
 */
function getApproval(approvalId) {
  return pendingApprovals.get(approvalId) || null;
}

/**
 * getAllApprovals
 */
function getAllApprovals() {
  return [...pendingApprovals.values()];
}

/**
 * notifyOperator
 * Stub — replace with real Telegram notification when bot is running.
 */
function notifyOperator(record) {
  console.log(`[approvalQueue] ⏳ PENDING APPROVAL ${record.approvalId}: node "${record.node.id}" (${record.node.agentType}) in snapshot ${record.snapshotId}`);
  // TODO: send Telegram message to Operator chat
  // bot.sendMessage(OPERATOR_CHAT_ID, `Approval needed: ${record.approvalId}\nNode: ${record.node.id}\nAgent: ${record.node.agentType}`);
}

module.exports = {
  queueForApproval,
  approveNode,
  rejectNode,
  getPendingApprovals,
  getApproval,
  getAllApprovals,
};
