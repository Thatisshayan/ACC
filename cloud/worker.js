// cloud/worker.js
const { getNextTask, updateTask } = require("./queue.js");
const { executeTask }             = require("./executor.js");
const { updateWorkerHeartbeat }   = require("./system/health.js");
const { logEvent }                = require("./logs/logger.js");

// Heartbeat every 2 seconds so health monitor can detect stalls
setInterval(() => updateWorkerHeartbeat(), 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * workerLoop
 * Continuously pulls the highest-priority queued task and executes it.
 * Runs until the process exits.
 */
async function workerLoop() {
  console.log("[worker] Worker loop started (priority-aware).");

  while (true) {
    const task = getNextTask();

    if (!task) {
      await sleep(500); // idle — no queued tasks
      continue;
    }

    console.log(`[worker] Running task ${task.id} | agentType: ${task.agentType} | priority: ${task.meta.priority}`);
    updateTask(task.id, { status: "running" });
    logEvent("task_start", "Task started", { taskId: task.id, agentType: task.agentType });

    try {
      const result = await executeTask({
        id:        task.id,
        agentType: task.agentType,
        payload:   task.payload,
        meta:      task.meta,
      });

      if (result.success) {
        updateTask(task.id, { status: "completed", result, error: null });
        logEvent("task_complete", "Task completed", { taskId: task.id });
        console.log(`[worker] Task ${task.id} completed.`);
      } else {
        updateTask(task.id, { status: "failed", error: result.error, result: null });
        logEvent("task_error", "Task failed", { taskId: task.id, error: result.error });
        console.log(`[worker] Task ${task.id} failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`[worker] Unhandled error on task ${task.id}:`, err.message);
      updateTask(task.id, { status: "failed", error: err.message, result: null });
      logEvent("task_error", "Unhandled worker error", { taskId: task.id, error: err.message });
    }
  }
}

/**
 * startWorker (legacy compat — wraps workerLoop in a non-blocking call)
 * @param {Object} options
 * @param {number} options.intervalMs - ignored (loop uses dynamic sleep)
 */
function startWorker({ intervalMs = 500 } = {}) {
  console.log("[worker] Starting priority-aware worker...");
  workerLoop().catch(err => console.error("[worker] Fatal:", err));
}

module.exports = { workerLoop, startWorker };
