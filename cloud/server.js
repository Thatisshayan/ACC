// cloud/server.js
require('./config/validateEnv'); // must be first — exits in production if critical env vars missing
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
const moduleLoadStatus = {};
const emailRoutes              = safeRequire("./api/emailRoutes.js", "email");
const loopsRoutes              = safeRequire("./api/loopsRoutes.js", "loops");
function safeRequire(mod) {
  return safeRequireWithName(mod, mod);
}
function safeRequireWithName(mod, name) {
  try {
    const loaded = require(mod);
    moduleLoadStatus[name] = { loaded: true, error: null };
    return loaded;
  } catch (e) {
    moduleLoadStatus[name] = { loaded: false, error: e.message };
    console.error(`[server] LOAD FAIL ${mod}: ${e.message}`);
    return null;
  }
}
const cardRoutes    = safeRequireWithName("./api/cardRoutes.js", "card");
const phoneRoutes   = safeRequireWithName("./api/phoneRoutes.js", "phone");
const billingRoutes = safeRequireWithName("./api/billingRoutes.js", "billing");
const memoryRoutes  = safeRequireWithName("./api/memoryRoutes.js", "memory");
const statusSummary            = require("./api/statusSummary.js");
const messagesRoutes           = require("./api/messages.js");
const assistantRoutes          = require("./api/assistant.js");
const uiRoutes                 = require("./api/uiRoutes.js");
const taskbusRoutes            = require("./taskbus/routes.js");
const hubRoutes                = require("./hub/routes.js");
const autonomyRoutes           = require("./autonomy/routes.js");
const autonomyLoop             = require("./autonomy/loop.js");
const { startWSServer }        = require("./ws/server.js");
const {
  requireOperatorOrAdmin,
  requireServiceOperatorOrAdmin,
} = require("./middleware/auth.js");
const orchestrator = require("./orchestrator.js");

const app  = express();
const PORT = process.env.PORT || 4000;
const UI_DIST_PATH = path.join(__dirname, "../ui/dist");
app.locals.moduleLoadStatus = moduleLoadStatus;

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
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
});
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

function maskEmail(email) {
  const value = String(email || '').trim();
  const at = value.indexOf('@');
  if (at <= 1) return '***';
  return `${value.slice(0, 2)}***${value.slice(at)}`;
}

function routeOrchestratorTask(task) {
  const role = task?.assigned_agent_role;
  if (role === "architect") return "copilot";
  if (role === "writer") return "claude";
  if (role === "engineer") return "copilot";
  return "copilot";
}

// ---------- Health (root + /api/health — both must return JSON on Railway) ----------
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ACC v2", time: new Date().toISOString(), env: process.env.NODE_ENV || "development" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ACC Module 7", version: "2.3.0", routes: { card: !!cardRoutes, phone: !!phoneRoutes, billing: !!billingRoutes, memory: !!memoryRoutes }, time: new Date().toISOString() });
});

app.get("/api/config/public", (req, res) => {
  res.json({
    success: true,
    config: {
      supabaseUrl: (process.env.SUPABASE_URL || "").trim() || null,
      supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || null,
      appUrl: process.env.ACC_PUBLIC_URL || null,
    },
  });
});

// ONE-TIME SETUP — remove after running
app.get("/api/admin/setup", requireOperatorOrAdmin, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, error: "Not found" });
  }
  const results = { env: { stripe: !!process.env.STRIPE_API_KEY, supabase: !!process.env.SUPABASE_URL, svcKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY } };
  // 1. Waitlist count — use same init pattern as supabaseMemory.js
  try {
    const { createClient } = require("@supabase/supabase-js");
    const ws = require("ws");
    const sb = createClient(
      (process.env.SUPABASE_URL || "").trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
      { realtime: { transport: ws } }
    );
    const { count, error } = await sb.from("acc_waitlist").select("*", { count: "exact", head: true });
    results.waitlist = error ? { error: error.message } : { count };
  } catch(e) { results.waitlist = { error: e.message }; }
  // 2. Stripe products — use same lazy pattern as billingRoutes.js
  try {
    const key = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Neither STRIPE_API_KEY nor STRIPE_SECRET_KEY found in Railway env");
    const stripe = require("stripe")(key);
    const existing = await stripe.products.list({ limit: 20, active: true });
    const has = name => existing.data.find(p => p.name === name);
    const upsert = async (name, desc, cents) => {
      const found = has(name);
      if (found) {
        const prices = await stripe.prices.list({ product: found.id, active: true, limit: 1 });
        return { note: "already exists", product: found.id, price: prices.data[0]?.id };
      }
      const p = await stripe.products.create({ name, description: desc });
      const price = await stripe.prices.create({ product: p.id, unit_amount: cents, currency: "usd", recurring: { interval: "month" } });
      return { product: p.id, price: price.id };
    };
    results.stripe = {
      starter:  await upsert("ACC Starter",  "AI OS for individuals — 50 tasks/mo",          1900),
      builder:  await upsert("ACC Builder",  "For builders & small teams — 200 tasks/mo",    4900),
      operator: await upsert("ACC Operator", "Full operator access — unlimited tasks",        9900),
    };
  } catch(e) { results.stripe = { error: e.message }; }
  res.json(results);
});

app.get("/api/debug", requireOperatorOrAdmin, (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, error: "Not found" });
  }
  const tests = {};
  ["./api/cardRoutes.js","./api/phoneRoutes.js","./api/billingRoutes.js","./api/memoryRoutes.js"].forEach(m => {
    try { require(m); tests[m] = "ok"; } catch(e) { tests[m] = e.message; }
  });
  res.json({ version: "2.3.0", loaded: { card: !!cardRoutes, phone: !!phoneRoutes, billing: !!billingRoutes, memory: !!memoryRoutes }, requires: tests, node: process.version });
});

// Inline billing test — bypasses sub-router to isolate 404 source
app.get("/api/billing/plans", requireOperatorOrAdmin, (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, error: "Not found" });
  }
  const { PLANS } = require("./api/billingRoutes.js");
  const plans = Object.entries(PLANS).map(([id, p]) => ({ id, name: p.name, price: p.price, features: p.features }));
  res.json({ success: true, source: "inline", plans });
});

// ---------- Execute (enqueue task) ----------
app.post("/api/execute", requireOperatorOrAdmin, (req, res) => {
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

app.post("/orchestrate", requireOperatorOrAdmin, (req, res) => {
  const { command, project } = req.body || {};
  if (!command) return res.status(400).json({ error: "Missing 'command' in body" });
  const graph  = orchestrator.buildTaskGraph(command, project || "Generic");
  const routed = graph.map(task => ({ ...task, target: routeOrchestratorTask(task) }));
  res.json({ project: project || "Generic", command, task_graph: routed });
});

// ---------- Admin Dashboard ----------
// Mounted at both /admin (legacy) and /api/admin (UI calls baseURL /api + /admin/*)
app.use("/admin", requireOperatorOrAdmin, adminRouter);
app.use("/admin/dlq", requireOperatorOrAdmin, dlqRoutes);
app.use("/api/admin", requireOperatorOrAdmin, adminRouter);
app.use("/api/admin/dlq", requireOperatorOrAdmin, dlqRoutes);

// ---------- Agent Task Bus ----------
app.use("/api/taskbus", requireServiceOperatorOrAdmin, taskbusRoutes);

// ---------- App Hub (bidirectional app control) ----------
// Uses the shared auth middleware boundary.
app.use("/api/hub", requireServiceOperatorOrAdmin, hubRoutes);

// ---------- Autonomy (self-scheduling loops) ----------
app.use("/api/autonomy", requireServiceOperatorOrAdmin, autonomyRoutes);

// ---------- Security Approval + Telegram Webhook ----------
app.use("/api", securityApproval);
app.use("/api", telegramWebhook);
app.use("/api", webhookHandler);
app.use("/api/messages", requireOperatorOrAdmin, messagesRoutes);
app.use("/api/assistant", requireOperatorOrAdmin, assistantRoutes);
app.use("/api/voice", requireOperatorOrAdmin, assistantRoutes);
app.use("/api/alphonso-bridge", alphonsoBridge);
app.use("/api/outreach", requireOperatorOrAdmin, outreachRoutes);
app.use("/api/synapse", requireOperatorOrAdmin, synapseRoutes);
app.use("/api/fsc",      fscRoutes);
if (emailRoutes) app.use("/api/email", emailRoutes);
if (loopsRoutes) app.use("/api/loops", loopsRoutes);
if (cardRoutes)    app.use("/api/card", requireOperatorOrAdmin, cardRoutes);
if (phoneRoutes)   app.use("/api/phone",   phoneRoutes);
if (billingRoutes) app.use("/api/billing", billingRoutes);
if (memoryRoutes)  app.use("/api/memory", requireOperatorOrAdmin, memoryRoutes);
app.use("/api/status", requireOperatorOrAdmin, statusSummary);

// ---------- UI Routes ----------
app.use("/api/ui", requireOperatorOrAdmin, uiRoutes);

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
    console.log(`[waitlist] New signup: ${maskEmail(email)}`);
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
