// cloud/server.js
const express      = require("express");
const cors         = require("cors");
const { enqueueTask, getTask } = require("./queue.js");
const { startWorker }          = require("./worker.js");
const { adminRouter }          = require("./admin/api.js");
const dlqRoutes                = require("./admin/dlqRoutes.js");
const securityApproval         = require("./api/securityApproval.js");
const telegramWebhook          = require("./api/telegramWebhook.js");
const uiRoutes                 = require("./api/uiRoutes.js");
const taskbusRoutes            = require("./taskbus/routes.js");
const { startWSServer }        = require("./ws/server.js");
const orchestrator = require("./orchestrator.js");
const cloudRouter  = require("./router.js");

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Worker singleton
let workerStarted = false;
function ensureWorker() {
  if (!workerStarted) {
    startWorker({ intervalMs: 1000 });
    workerStarted = true;
  }
}

// ---------- Health ----------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ACC Module 7", time: new Date().toISOString() });
});

// ---------- Execute (enqueue task) ----------
app.post("/api/execute", (req, res) => {
  try {
    const { agentType, payload, meta } = req.body || {};
    if (!agentType) {
      return res.status(400).json({ success: false, error: "agentType is required." });
    }
    const task = enqueueTask({ agentType, payload, meta });
    ensureWorker();
    return res.json({ success: true, taskId: task.id, status: task.status });
  } catch (err) {
    console.error("[api] /execute error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Task status ----------
app.get("/api/task/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: "Task not found." });
  return res.json({
    success: true,
    task: {
      id: task.id, status: task.status, result: task.result,
      error: task.error, createdAt: task.createdAt, updatedAt: task.updatedAt,
      agentType: task.agentType, meta: task.meta,
    },
  });
});

// ---------- Orchestrate (Module 6) ----------
app.get("/", (req, res) => {
  res.json({ status: "ACC Cloud Server OK", port: PORT });
});

app.post("/orchestrate", (req, res) => {
  const { command, project } = req.body || {};
  if (!command) return res.status(400).json({ error: "Missing 'command' in body" });
  const graph  = orchestrator.buildTaskGraph(command, project || "Generic");
  const routed = graph.map(task => ({ ...task, target: cloudRouter.routeTask(task) }));
  res.json({ project: project || "Generic", command, task_graph: routed });
});

// ---------- Admin Dashboard ----------
app.use("/admin", adminRouter);
app.use("/admin/dlq", dlqRoutes);

// ---------- Agent Task Bus ----------
app.use("/api/taskbus", taskbusRoutes);

// ---------- Security Approval + Telegram Webhook ----------
app.use("/api", securityApproval);
app.use("/api", telegramWebhook);

// ---------- UI Routes ----------
app.use("/api/ui", uiRoutes);

const httpServer = app.listen(PORT, () => {
  console.log(`[server] ACC Cloud listening on http://localhost:${PORT}`);
  console.log(`[server] Routes: GET /api/health  POST /api/execute  GET /api/task/:id  POST /orchestrate`);
  console.log(`[server] Admin:  GET /admin/users  /admin/graphs  /admin/tasks  /admin/system`);
  console.log(`[server] UI:     GET /api/ui/dashboard  /api/ui/snapshots  /api/ui/approvals`);
  console.log(`[server] WS:     ws://localhost:${PORT}/ws`);
  startWSServer(httpServer);
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[server] Port ${PORT} already in use. Kill the existing process or change PORT in .env`);
    process.exit(1);
  } else {
    throw err;
  }
});
