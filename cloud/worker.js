// cloud/worker.js
const { getNextTask, updateTask } = require("./queue.js");
const { executeTask }             = require("./executor.js");
const { updateWorkerHeartbeat }   = require("./system/health.js");
const { logEvent }                = require("./logs/logger.js");
const logger                      = require("./utils/logger.js");
const { withRetry }               = require("./utils/retryPolicy.js");
const { writeToDLQ }              = require("./dlq/handler.js");

const RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 100, // shorter delays during local test run safety
  maxDelayMs: 1000,
  jitter: 'full'
};

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

    logger.info(`[worker][task=${task.id}] Running | agentType: ${task.agentType} | priority: ${task.meta.priority}`);
    updateTask(task.id, { status: "running" });
    logEvent("task_start", "Task started", { taskId: task.id, agentType: task.agentType });

    let result;
    try {
      result = await withRetry(
        async () => {
          const res = await executeTask({
            id:        task.id,
            agentType: task.agentType,
            payload:   task.payload,
            meta:      task.meta,
          });
          // Awaiting operator approval is not a failure — retrying it would
          // create a duplicate approval request on every attempt, and
          // dead-lettering it would abandon a task that's simply waiting.
          if (res.status === "pendingApproval") return res;
          if (!res.success) {
            throw new Error(res.error || "Execution failed");
          }
          return res;
        },
        RETRY_POLICY,
        (attempt, err) => {
          logger.warn(`[worker][task=${task.id}] Attempt ${attempt} failed: ${err.message}. Retrying...`);
        }
      );

      if (result.status === "pendingApproval") {
        updateTask(task.id, { status: "pendingApproval", result: null, error: null });
        logEvent("task_pending_approval", "Task awaiting operator approval", { taskId: task.id, approvalId: result.approvalId });
        logger.info(`[worker][task=${task.id}] Awaiting approval (id: ${result.approvalId})`);
      } else {
        updateTask(task.id, { status: "completed", result, error: null });
        logEvent("task_complete", "Task completed", { taskId: task.id });
        logger.info(`[worker][task=${task.id}] Completed | provider: ${result.provider || 'default'}`);
      }
    } catch (err) {
      logger.error(`[worker][task=${task.id}] Exhausted retries. Writing to DLQ. Error: ${err.message}`);

      let dlqRecord;
      try {
        dlqRecord = writeToDLQ({
          graphId: task.meta?.graphId || 'task-bus-graph',
          node: {
            id: task.id,
            type: task.agentType,
            payload: task.payload,
            attempts: RETRY_POLICY.maxAttempts,
            lastError: err.message
          },
          context: task.meta || {},
          error: err.message
        });
      } catch (dlqError) {
        logger.error(`[worker][task=${task.id}] DLQ write failed: ${dlqError.message}`);
      }

      updateTask(task.id, { status: "failed", error: err.message, result: null });
      logEvent("task_error", "Task failed", { taskId: task.id, error: err.message, dlqId: dlqRecord?.id || null });
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
  workerLoop().catch(err => logger.error("[worker] Fatal:", err));
}

module.exports = { workerLoop, startWorker };
