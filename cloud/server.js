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
const fscRoutes                = require("./api/fscRoutes.js");
function safeRequire(mod) {
  try { return require(mod); }
  catch(e) { console.error(`[server] LOAD FAIL ${mod}: ${e.message}`); return null; }
}
const cardRoutes    = safeRequire("./api/cardRoutes.js");
const phoneRoutes   = safeRequire("./api/phoneRoutes.js");
const billingRoutes = safeRequire("./api/billingRoutes.js");
const memoryRoutes  = safeRequire("./api/memoryRoutes.js");
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
  'https://ju2687yg.up.railway.app',
  'https://acccommand.center',
  'https://www.acccommand.center',
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
  res.json({ ok: true, service: "ACC Module 7", version: "2.3.0", routes: { card: !!cardRoutes, phone: !!phoneRoutes, billing: !!billingRoutes, memory: !!memoryRoutes }, time: new Date().toISOString() });
});

// ---------- Public config (safe to expose: only contains publishable keys) ----------
// Serves Supabase anon key + URL so they never need to be hardcoded in HTML files.
// Rotating the key in Railway env vars is sufficient — no code redeploy needed.
app.get("/api/config/public", (req, res) => {
  res.json({
    supabaseUrl:     (process.env.SUPABASE_URL  || '').trim(),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
});

// Inline billing test — bypasses sub-router to isolate 404 source
app.get("/api/billing/plans", (req, res) => {
  const { PLANS } = require("./api/billingRoutes.js");
  const plans = Object.entries(PLANS).map(([id, p]) => ({ id, name: p.name, price: p.price, features: p.features }));
  res.json({ success: true, source: "inline", plans });
});

// ---------- Execute (enqueue task) — requires TASKBUS_API_KEY Bearer token ----------
app.post("/api/execute", taskbusAuth, (req, res) => {
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

// ---------- Static assets for React app ----------
app.use("/app", express.static(UI_DIST_PATH));

// ---------- Public pages ----------
// Root → landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../landing/index.html"));
});

// Login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../landing/login.html"));
});

// App entry point — auth-check wrapper, then React dashboard
app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "../landing/auth-check.html"));
});

// React app inner routes (SPA — serve index.html for any /app/* path)
app.get("/app/*splat", (req, res) => {
  res.sendFile(path.join(UI_DIST_PATH, "index.html"), (err) => {
    if (err) res.redirect("/app");
  });
});

// ---------- Orchestrate (Module 6) ----------

app.post("/orchestrate", taskbusAuth, (req, res) => {
  const { command, project } = req.body || {};
  if (!command) return res.status(400).json({ error: "Missing 'command' in body" });
  const graph  = orchestrator.buildTaskGraph(command, project || "Generic");
  const routed = graph.map(task => ({ ...task, target: cloudRouter.routeTask(task) }));
  res.json({ project: project || "Generic", command, task_graph: routed });
});

// ---------- Admin Dashboard — requires TASKBUS_API_KEY Bearer token ----------
app.use("/admin",        taskbusAuth, adminRouter);
app.use("/admin/dlq",    taskbusAuth, dlqRoutes);
app.use("/api/admin",    taskbusAuth, adminRouter);
app.use("/api/admin/dlq",taskbusAuth, dlqRoutes);

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
app.use("/api/outreach", taskbusAuth, outreachRoutes);
app.use("/api/synapse",  taskbusAuth, synapseRoutes);
app.use("/api/fsc",      taskbusAuth, fscRoutes);
if (cardRoutes)    app.use("/api/card",    taskbusAuth, cardRoutes);
if (phoneRoutes)   app.use("/api/phone",   taskbusAuth, phoneRoutes);
if (billingRoutes) app.use("/api/billing", billingRoutes);  // /api/billing/plans is public pricing data; checkout/webhook have own validation
if (memoryRoutes)  app.use("/api/memory",  taskbusAuth, memoryRoutes);
app.use("/api/status", statusSummary);

// ---------- UI Routes ----------
app.use("/api/ui", uiRoutes);

// ---------- Waitlist ----------
app.post("/api/waitlist", async (req, res) => {
  const { email, automate, role, control } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: "Valid email required." });
  }
  try {
    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(
      (process.env.SUPABASE_URL || '').trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || ''
    );
    if (supabase) {
      const { error } = await supabase
        .from("acc_waitlist")
        .insert({ email, automate, role, control, created_at: new Date().toISOString() });
      if (error && error.code === '23505') {
        return res.status(409).json({ success: true, message: "Already registered." });
      }
      if (error) throw error;
    }
    console.log(`[waitlist] New signup: ${email}`);
    return res.json({ success: true, message: "You're on the list!" });
  } catch (err) {
    console.error("[waitlist] error:", err.message);
    return res.status(500).json({ success: false, error: "Failed to save. Try again." });
  }
});

// Landing page also accessible at /landing (legacy + direct link)
app.get("/landing", (req, res) => {
  res.sendFile(path.join(__dirname, "../landing/index.html"));
});

// Legal pages
app.get("/privacy", (req, res) => {
  res.sendFile(path.join(__dirname, "../landing/privacy.html"));
});
app.get("/terms", (req, res) => {
  res.sendFile(path.join(__dirname, "../landing/terms.html"));
});

// Non-API catch-all: redirect to landing
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/admin")) return next();
  res.redirect("/");
});

// API 404 handler
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
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
