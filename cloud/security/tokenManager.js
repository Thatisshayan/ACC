// cloud/security/tokenManager.js
// Ephemeral, scoped, time-limited tokens for connector access.
// Tokens auto-expire and are revoked at task end.

const ephemeralStore = new Map(); // token → { role, expiresAt, taskId }

/**
 * createEphemeralToken
 * @param {{ role: string, ttl: number, taskId: string|null }} params
 * @returns {Promise<string>} token
 */
async function createEphemeralToken({ role, ttl = 300, taskId = null }) {
  const token     = `ephemeral_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Date.now() + ttl * 1000;

  ephemeralStore.set(token, { role, expiresAt, taskId, createdAt: Date.now() });

  // Auto-revoke after TTL
  setTimeout(() => {
    ephemeralStore.delete(token);
  }, ttl * 1000 + 500);

  return token;
}

/**
 * revokeEphemeralToken
 * @param {string} token
 */
async function revokeEphemeralToken(token) {
  ephemeralStore.delete(token);
  return true;
}

/**
 * validateEphemeralToken
 * @param {string} token
 * @returns {boolean}
 */
function validateEphemeralToken(token) {
  const rec = ephemeralStore.get(token);
  if (!rec) return false;
  if (Date.now() > rec.expiresAt) {
    ephemeralStore.delete(token);
    return false;
  }
  return true;
}

/**
 * revokeTaskTokens
 * Revokes all tokens associated with a given taskId (call at task end).
 * @param {string} taskId
 */
function revokeTaskTokens(taskId) {
  for (const [token, rec] of ephemeralStore.entries()) {
    if (rec.taskId === taskId) {
      ephemeralStore.delete(token);
    }
  }
}

module.exports = {
  createEphemeralToken,
  revokeEphemeralToken,
  validateEphemeralToken,
  revokeTaskTokens,
};
