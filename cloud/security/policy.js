// cloud/security/policy.js
const fs   = require("fs");
const path = require("path");

const POLICY_PATH = path.join(__dirname, "policy.json");

let POLICY = {};
try {
  POLICY = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
} catch (e) {
  console.warn("[policy] Could not load policy.json:", e.message);
  POLICY = {};
}

/** getPolicy */
function getPolicy() { return POLICY; }

/**
 * checkActionAllowed
 * Checks global rules + per-action policy for a given role.
 *
 * @param {string} actionKey  - e.g. "marketplace.postItem"
 * @param {string} role
 * @param {Object} payload    - { taskId?, contactInTask? }
 * @returns {{ allowed: boolean, requiresApproval?: boolean, reason?: string }}
 */
function checkActionAllowed(actionKey, role, payload = {}) {
  const global         = POLICY.globalRules    || {};
  const actionPolicies = POLICY.actionPolicies || {};
  const policy         = actionPolicies[actionKey] || {};

  // Global rule: no unsolicited contact
  if (
    global.noUnsolicitedContact &&
    (actionKey.startsWith("outreach.") || actionKey.startsWith("marketplace.message"))
  ) {
    if (!payload.taskId || !payload.contactInTask) {
      return { allowed: false, reason: "Unsolicited contact prohibited by global policy." };
    }
  }

  // Role check
  const allowedRoles = policy.allowedRoles ||
    ["Admin", "Operator", "Agent", "SalesBot", "Marketing", "LegalAssistant"];

  if (role !== "Admin" && !allowedRoles.includes(role)) {
    return { allowed: false, reason: `Role "${role}" not permitted for action "${actionKey}".` };
  }

  // Approval requirement
  if (policy.requiresApproval) {
    return { allowed: false, requiresApproval: true, reason: "Action requires explicit approval." };
  }

  return { allowed: true };
}

/** requiresSnapshotApproval */
function requiresSnapshotApproval() {
  return !!(POLICY.globalRules || {}).requireSnapshotApprovalBy;
}

/** getTokenPolicy */
function getTokenPolicy() {
  return POLICY.tokenPolicy || { ephemeralTokenTTLSeconds: 300, revokeOnTaskEnd: true };
}

/** isSandboxDefault */
function isSandboxDefault() {
  return !!(POLICY.globalRules || {}).defaultSandboxMode;
}

module.exports = {
  getPolicy,
  checkActionAllowed,
  requiresSnapshotApproval,
  getTokenPolicy,
  isSandboxDefault,
};
