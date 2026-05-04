// cloud/telegram/users.js
// In-memory user store. Swap to DB later without changing callers.

const users = new Map();

/**
 * ensureUserProfile
 * Creates a user profile if one doesn't exist yet.
 * @param {string} userId
 */
async function ensureUserProfile(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      id:        userId,
      role:      "normal", // admin | power | normal | guest | banned
      createdAt: new Date().toISOString(),
    });
  }
}

/**
 * getUserProfile
 * @param {string} userId
 * @returns {Object|null}
 */
function getUserProfile(userId) {
  return users.get(userId) || null;
}

module.exports = { ensureUserProfile, getUserProfile, users };
