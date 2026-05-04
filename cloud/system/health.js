// cloud/system/health.js

let workerHeartbeat = Date.now();

/**
 * updateWorkerHeartbeat
 * Called every 2s by the worker loop.
 */
function updateWorkerHeartbeat() {
  workerHeartbeat = Date.now();
}

/**
 * getWorkerStatus
 * Returns "healthy" if heartbeat is < 5s old, else "unresponsive".
 */
function getWorkerStatus() {
  const diff = Date.now() - workerHeartbeat;
  return diff < 5000 ? "healthy" : "unresponsive";
}

/**
 * getWorkerHeartbeatAge
 * Returns ms since last heartbeat.
 */
function getWorkerHeartbeatAge() {
  return Date.now() - workerHeartbeat;
}

module.exports = { updateWorkerHeartbeat, getWorkerStatus, getWorkerHeartbeatAge };
