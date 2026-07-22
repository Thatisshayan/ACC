// cloud/utils/approvalQueue.js
// In-memory pending approval queue + Telegram notification.
// Nodes with requiresApproval:true are held here until an Operator/Admin approves.

const fetch = require('node-fetch');
const { readSecret } = require('../security/vaultStub.js');

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
 * Logs locally and, when configured, sends a Telegram message to the
 * Operator so pending graph-node approvals aren't silently invisible.
 */
function notifyOperator(record) {
  console.log(`[approvalQueue] ⏳ PENDING APPROVAL ${record.approvalId}: node "${record.node.id}" (${record.node.agentType}) in snapshot ${record.snapshotId}`);

  const token  = readSecret('TELEGRAM_BOT_TOKEN')     || process.env.TELEGRAM_BOT_TOKEN     || null;
  const chatId = readSecret('SHAYAN_TELEGRAM_CHAT_ID') || process.env.SHAYAN_TELEGRAM_CHAT_ID
              || readSecret('SAYAN_TELEGRAM_CHAT_ID')   || process.env.SAYAN_TELEGRAM_CHAT_ID  || null;
  if (!token || !chatId) {
    console.log('[approvalQueue] TELEGRAM_BOT_TOKEN / chat id not set — skipping Telegram notify.');
    return;
  }

  const text = [
    `⏳ *Approval Required*`,
    ``,
    `🤖 Node: \`${record.node.id}\``,
    `🎯 Agent: ${record.node.agentType}`,
    `🆔 Approval ID: \`${record.approvalId}\``,
    `📦 Snapshot: \`${record.snapshotId}\``,
  ].join('\n');

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(e => console.warn('[approvalQueue] Telegram notify failed:', e.message));
}

module.exports = {
  queueForApproval,
  approveNode,
  rejectNode,
  getPendingApprovals,
  getApproval,
  getAllApprovals,
};
