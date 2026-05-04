// cloud/api.js
const express = require("express");
const { enqueueTask, getTask } = require("./queue.js");
const { startWorker } = require("./worker.js");

const router = express.Router();

// Start worker once when API is first used
let workerStarted = false;
function ensureWorker() {
  if (!workerStarted) {
    startWorker({ intervalMs: 1000 });
    workerStarted = true;
  }
}

/**
 * GET /health
 */
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "ACC Module 7", time: new Date().toISOString() });
});

/**
 * POST /execute
 * Body: { agentType, payload, meta? }
 */
router.post("/execute", (req, res) => {
  try {
    const { agentType, payload, meta } = req.body || {};

    if (!agentType) {
      return res.status(400).json({ success: false, error: "agentType is required." });
    }

    const task = enqueueTask({ agentType, payload, meta });
    ensureWorker();

    return res.json({
      success: true,
      taskId: task.id,
      status: task.status,
    });
  } catch (err) {
    console.error("[api] /execute error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /task/:id
 * Returns task status + result
 */
router.get("/task/:id", (req, res) => {
  const { id } = req.params;
  const task = getTask(id);

  if (!task) {
    return res.status(404).json({ success: false, error: "Task not found." });
  }

  return res.json({
    success: true,
    task: {
      id:        task.id,
      status:    task.status,
      result:    task.result,
      error:     task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      agentType: task.agentType,
      meta:      task.meta,
    },
  });
});

module.exports = router;
