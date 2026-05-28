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
const outreachRoutes           = require("./api/outreachRoutes.js");
const synapseRoutes            = require("./api/synapseRoutes.js");
const statusSummary            = require("./api/statusSummary.js");
const messagesRoutes           = require("./api/messages.js");
const assistantRoutes          = require("./api/assistant.js");
const uiRoutes                 = require("./api/uiRoutes.js");
const taskbusRoutes            = require("./taskbus/routes.js");
const hubRoutes                = require("./hub/routes.js");
const autonomyRoutes           = require("./autonomy/routes.js");
const autonomyLoop             = require("./autonomy/loop.js");
const { startWSServer }        = require("./ws/server.js");
const orchestrator = require("./orchestrator.js");
const cloudRouter  = require("./router.js");

const app  = express();
const PORT = process.env.PORT || 4000;
const UI_DIST_PATH = path.join(__dirname, "../ui/dist");

// Rate limiting — relaxed in dev, strict in prod
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || req.path === '/health',
});

// CORS — allow Railway domain + any explicitly listed origins.
// Set CORS_ALLOWED_ORIGINS=https://foo.up.railway.app,https://example.com to extend.
// Requests with no Origin header (server-to-server, curl) always pass through.
function toOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    try {
      return new URL(`https://${String(value).replace(/^https?:\/\//, '')}`).origin;
    } catch {
      return null;
    }
  }
}

const _corsOrigins = [
  'https://acc-production-a26c.up.railway.app',
  toOrigin(process.env.ACC_PUBLIC_URL),
  toOrigin(process.env.ACC_WEBAPP_URL),
  toOrigin(process.env.ACC_API_BASE_URL),
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
].filter(Boolean);
app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true); // same-origin / server-to-server
    if (process.env.NODE_ENV !== 'production') return cb(null, true); // open in dev
    if (_corsOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));
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
// Mounted at both /admin (legacy) and /api/admin (UI calls baseURL /api + /admin/*)
app.use("/admin", adminRouter);
app.use("/admin/dlq", dlqRoutes);
app.use("/api/admin", adminRouter);
app.use("/api/admin/dlq", dlqRoutes);

// ---------- Task Bus auth middleware ----------
// Set TASKBUS_API_KEY in .env to require Bearer token on all /api/taskbus/* routes.
// If unset the routes are open (dev mode).
const _TASKBUS_KEY = process.env.TASKBUS_API_KEY;
function taskbusAuth(req, res, next) {
  if (!_TASKBUS_KEY) return next();
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== _TASKBUS_KEY) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

// ---------- Agent Task Bus ----------
app.use("/api/taskbus", taskbusAuth, taskbusRoutes);

// ---------- App Hub (bidirectional app control) ----------
// Uses same Bearer token as taskbus. Open in dev (no TASKBUS_API_KEY set).
app.use("/api/hub", taskbusAuth, hubRoutes);

// ---------- Autonomy (self-scheduling loops) ----------
app.use("/api/autonomy", taskbusAuth, autonomyRoutes);

// ---------- Security Approval + Telegram Webhook ----------
app.use("/api", securityApproval);
app.use("/api", telegramWebhook);
app.use("/api", webhookHandler);
app.use("/api/messages", messagesRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/alphonso-bridge", alphonsoBridge);
app.use("/api/outreach", outreachRoutes);
app.use("/api/synapse", synapseRoutes);
app.use("/api/status", statusSummary);

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
  autonomyLoop.seedDefaultLoops();
  autonomyLoop.start();
  console.log(`[server] ACC Cloud listening on http://localhost:${PORT}`);
  console.log(`[server] Routes: GET /api/health  POST /api/execute  GET /api/task/:id  POST /orchestrate`);
  console.log(`[server] Admin:  GET /admin/users  /admin/graphs  /admin/tasks  /admin/system`);
  console.log(`[server] UI:     GET /api/ui/dashboard  /api/ui/snapshots  /api/ui/approvals`);
  console.log(`[server] Bridge: GET /api/alphonso-bridge/status  POST /api/alphonso-bridge`);
  console.log(`[server] Messages: GET /api/messages/status  POST /api/messages/send`);
  console.log(`[server] Assistant: POST /api/assistant/parse  POST /api/assistant/execute`);
  console.log(`[server] Status: GET /api/status  /api/status/summary`);
  console.log(`[server] WS:     ws://localhost:${PORT}/ws`);

  const { broadcast } = startWSServer(httpServer);
  const taskbusStore = require("./taskbus/store.js");
  taskbusStore.setTaskUpdateHook(function(task) {
    broadcast("task_updated", {
      taskId:         task.id,
      status:         task.status,
      title:          task.title,
      assigned_agent: task.assigned_agent,
      provider_used:  task.provider_used || null,
      updated_at:     task.updated_at,
    });
  });
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
