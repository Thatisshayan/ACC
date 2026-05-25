// cloud/server.js
const express      = require("express");
const path         = require("path");
const cors         = require("cors");
const rateLimit    = require("express-rate-limit");
const { enqueueTask, getTask } = require("./queue.js");
const { startWorker }          = require("./worker.js");
const { adminRouter }          = require("./admin/api.js");
const dlqRoutes                = require("./admin/dlqRoutes.js");
const securityApproval         = require("./api/securityApproval.js");
const telegramWebhook          = require("./api/telegramWebhook.js");
const webhookHandler           = require("./telegram/webhookHandler.js");
const alphonsoBridge           = require("./api/alphonsoBridge.js");
const uiRoutes                 = require("./api/uiRoutes.js");
const taskbusRoutes            = require("./taskbus/routes.js");
const { startWSServer }        = require("./ws/server.js");
const orchestrator = require("./orchestrator.js");
const cloudRouter  = require("./router.js");

const app  = express();
const PORT = process.env.PORT || 4000;
const UI_DIST_PATH = path.join(__dirname, "../ui/dist");

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per windowMs
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use(limiter); // Apply rate limiting to all routes

// Worker singleton
let workerStarted = false;
function ensureWorker() {
  if (!workerStarted) {
    startWorker({ intervalMs: 1000 });
    workerStarted = true;
  }
}

// ---------- Health (root + /api/health — both must return JSON on Railway) ----------
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ACC v2", time: new Date().toISOString(), env: process.env.NODE_ENV || "development" });
});

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

// ---------- Frontend static hosting (if ui/dist exists) ----------
// Keeps API-only mode working while allowing Railway root domain to render the UI.
app.use(express.static(UI_DIST_PATH));

// ---------- Orchestrate (Module 6) ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(UI_DIST_PATH, "index.html"), (err) => {
    if (err) {
      res.json({ status: "ACC Cloud Server OK", port: PORT });
    }
  });
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
app.use("/api", webhookHandler);
app.use("/api/alphonso-bridge", alphonsoBridge);

// ---------- UI Routes ----------
app.use("/api/ui", uiRoutes);

// SPA fallback for non-API routes.
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(UI_DIST_PATH, "index.html"), (err) => {
    if (err) next();
  });
});

const httpServer = app.listen(PORT, () => {
  console.log(`[server] ACC Cloud listening on http://localhost:${PORT}`);
  console.log(`[server] Routes: GET /api/health  POST /api/execute  GET /api/task/:id  POST /orchestrate`);
  console.log(`[server] Admin:  GET /admin/users  /admin/graphs  /admin/tasks  /admin/system`);
  console.log(`[server] UI:     GET /api/ui/dashboard  /api/ui/snapshots  /api/ui/approvals`);
  console.log(`[server] Bridge: GET /api/alphonso-bridge/status  POST /api/alphonso-bridge`);
  console.log(`[server] WS:     ws://localhost:${PORT}/ws`);
  startWSServer(httpServer);
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // If the server already reached the listen callback, keep the process alive.
    // A late EADDRINUSE here is usually a duplicate bind attempt from another
    // startup side effect, and exiting would tear down an otherwise working API.
    console.warn(`[server] Port ${PORT} already in use. Keeping the current listener alive.`);
  } else {
    throw err;
  }
});
