// cloud/logs/logger.js

const logs = [];

/**
 * logEvent
 * @param {string} type    - e.g. "task_start" | "task_error" | "graph_step" | "user_action"
 * @param {string} message - human-readable summary
 * @param {Object} data    - structured context
 */
function logEvent(type, message, data = {}) {
  logs.push({
    id:        logs.length + 1,
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * getLogs
 * @param {number} limit - max entries to return (most recent)
 * @returns {Array}
 */
function getLogs(limit = 200) {
  return logs.slice(-limit);
}

/**
 * getLogsByType
 * @param {string} type
 * @param {number} limit
 */
function getLogsByType(type, limit = 100) {
  return logs.filter(l => l.type === type).slice(-limit);
}

module.exports = { logEvent, getLogs, getLogsByType };
