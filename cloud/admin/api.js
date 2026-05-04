// cloud/admin/api.js
const express            = require("express");
const { getActiveBot }   = require("../telegram/botLock.js");
const { snapshots }      = require("../orchestrator/snapshots.js");
const { queue, getAllTasks } = require("../queue.js");
const { users }          = require("../telegram/users.js");
const { getWorkerStatus } = require("../system/health.js");
const { getLogs }        = require("../logs/logger.js");
const { getGraphView }   = require("./graphView.js");
const { listConnectors } = require("../connectors/registry.js");
const { getPendingApprovals, approveNode, rejectNode, getAllApprovals } = require("../utils/approvalQueue.js");
const { getAuditTrail }  = require("../utils/auditLog.js");

const adminRouter = express.Router();

// ── Users ─────────────────────────────────────────────────────────────────────
adminRouter.get("/users", (req, res) => {
  res.json([...users.values()]);
});

// ── Graphs (snapshots) ────────────────────────────────────────────────────────
adminRouter.get("/graphs", (req, res) => {
  const graphs = [...snapshots.values()].map(snap => ({
    snapshotId:     snap.id,
    autoMode:       snap.meta?.autoMode,
    createdAt:      snap.createdAt,
    updatedAt:      snap.updatedAt,
    totalNodes:     (snap.nodes || []).length,
    completedNodes: (snap.nodes || []).filter(n => n.status === "completed").length,
    failedNodes:    (snap.nodes || []).filter(n => n.status === "failed").length,
    pendingNodes:   (snap.nodes || []).filter(n => n.status === "pending").length,
    runningNodes:   (snap.nodes || []).filter(n => n.status === "running").length,
  }));
  res.json(graphs);
});

// ── Task Queue ────────────────────────────────────────────────────────────────
adminRouter.get("/tasks", (req, res) => {
  const allTasks = getAllTasks().map(t => ({
    taskId:    t.id,
    agentType: t.agentType,
    priority:  t.meta?.priority,
    role:      t.meta?.role,
    status:    t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    error:     t.error,
    hasResult: !!t.result,
  }));
  res.json(allTasks);
});

// ── System Health ─────────────────────────────────────────────────────────────
adminRouter.get("/system", (req, res) => {
  res.json({
    activeBot:      getActiveBot(),
    workerStatus:   getWorkerStatus(),
    queueLength:    queue.length,
    totalTasks:     getAllTasks().length,
    deepseekStatus: process.env.DEEPSEEK_API_KEY ? "configured" : "missing key",
    openaiStatus:   process.env.OPENAI_API_KEY   ? "configured" : "missing key",
    whisperStatus:  process.env.OPENAI_API_KEY   ? "configured" : "missing key",
    claudeStatus:   process.env.CLAUDE_API_KEY   ? "configured" : "missing key",
    timestamp:      new Date().toISOString(),
  });
});

// ── Logs ──────────────────────────────────────────────────────────────────────
adminRouter.get("/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  res.json(getLogs(limit));
});

// ── Graph Detail View ─────────────────────────────────────────────────────────
adminRouter.get("/graphs/:id", (req, res) => {
  const view = getGraphView(req.params.id);
  if (!view) return res.status(404).json({ error: "Graph not found." });
  res.json(view);
});

// ── Connectors ────────────────────────────────────────────────────────────────
adminRouter.get("/connectors", (req, res) => {
  res.json(listConnectors());
});

// ── Approvals ─────────────────────────────────────────────────────────────────
adminRouter.get("/approvals", (req, res) => {
  const all = req.query.all === "true";
  res.json(all ? getAllApprovals() : getPendingApprovals());
});

adminRouter.post("/approvals/:id/approve", (req, res) => {
  const resolvedBy = req.body?.resolvedBy || "Operator";
  const record     = approveNode(req.params.id, resolvedBy);
  if (!record) return res.status(404).json({ error: "Approval not found." });
  res.json({ success: true, record });
});

adminRouter.post("/approvals/:id/reject", (req, res) => {
  const resolvedBy = req.body?.resolvedBy || "Operator";
  const record     = rejectNode(req.params.id, resolvedBy);
  if (!record) return res.status(404).json({ error: "Approval not found." });
  res.json({ success: true, record });
});

// ── Audit Trail ───────────────────────────────────────────────────────────────
adminRouter.get("/audit", (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  res.json(getAuditTrail(limit));
});

module.exports = { adminRouter };
