// cloud/utils/rolePolicy.js
// Role definitions, permission checks, and readOnly guards.

const ROLE_LEVELS = {
  Admin:          100,
  Operator:       80,
  LegalAssistant: 70,
  Agent:          60,
  Marketing:      60,
  SalesBot:       50,
  Viewer:         10,
};

const READ_ONLY_ROLES = new Set(["Viewer"]);

/**
 * isRoleAllowed
 * Checks if requesterRole is in the node's allowedRoles list.
 * Admin always passes. Missing allowedRoles = open to all non-Viewer.
 *
 * @param {string}   requesterRole
 * @param {string[]} allowedRoles  - from node.meta.allowedRoles
 * @returns {{ allowed: boolean, reason?: string }}
 */
function isRoleAllowed(requesterRole, allowedRoles) {
  if (!requesterRole) return { allowed: false, reason: "No role provided." };
  if (requesterRole === "Admin") return { allowed: true };
  if (READ_ONLY_ROLES.has(requesterRole)) {
    return { allowed: false, reason: `${requesterRole} is read-only.` };
  }
  if (!allowedRoles || allowedRoles.length === 0) return { allowed: true };
  if (allowedRoles.includes(requesterRole)) return { allowed: true };
  return { allowed: false, reason: `Role "${requesterRole}" not in allowedRoles: [${allowedRoles.join(", ")}]` };
}

/**
 * getRoleLevel
 * @param {string} role
 * @returns {number}
 */
function getRoleLevel(role) {
  return ROLE_LEVELS[role] ?? 0;
}

/**
 * isReadOnly
 * @param {string} role
 * @returns {boolean}
 */
function isReadOnly(role) {
  return READ_ONLY_ROLES.has(role);
}

module.exports = { isRoleAllowed, getRoleLevel, isReadOnly, ROLE_LEVELS, READ_ONLY_ROLES };
