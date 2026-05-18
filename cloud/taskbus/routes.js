// cloud/taskbus/routes.js
// REST API for ACC v2 Agent Task Bus
// Mount at: app.use('/api/taskbus', require('./taskbus/routes'));
'use strict';

const express = require('express');
const store   = require('./store.js');
const router  = require('./router.js');
const { getProvidersStatus } = require('./providerFallback.js');
const { log } = require('../utils/logger.js');
const app     = express.Router();

// ── GET /api/taskbus/agents ───────────────────────────────────────────────────
app.get('/agents', async function(req, res) {
  try {
    var providers = await getProvidersStatus();
    var agents    = Object.values(store.AGENTS).map(function(a) {
      // Attach provider health where applicable
      var providerKey = a.id === 'claude' ? 'claude' : a.id === 'chatgpt' ? 'deepseek' : a.id;
      var ps = providers[providerKey];
      return Object.assign({}, a, { provider_status: ps ? ps.status : 'n/a', provider_note: ps ? ps.note : '' });
    });
    res.json({ success: true, agents: agents, provider_order: (process.env.TASKBUS_PROVIDER_ORDER || 'deepseek,ollama,claude,smart_stub').split(',') });
  } catch(e) {
    res.json({ success: true, agents: Object.values(store.AGENTS) });
  }
});

// ── GET /api/taskbus/stats ────────────────────────────────────────────────────
app.get('/stats', function(req, res) {
  res.json({ success: true, stats: store.getStats() });
});

// ── GET /api/taskbus/integrations/status ────────────────────────────────────────
app.get('/integrations/status', async function(req, res) {
  var integrations = {};
  var files = ['langfuse','openrouter','qdrant','sentry','helicone','n8n','supabase','browserbase','flowise','neo4j','openhands','crewai','airtable','clickup'];
  for (var i = 0; i < files.length; i++) {
    var name = files[i];
    try {
      var mod = require('../integrations/' + name + '.js');
      var health = await mod.checkHealth();
      integrations[name] = Object.assign({ enabled: mod.enabled() }, health);
    } catch (e) {
      integrations[name] = { enabled: false, status: 'error', error: e.message };
    }
  }
  var statuses = Object.values(integrations).map(function(i) { return i.status; });
  var overall = statuses.every(function(s) { return s === 'connected' || s === 'disabled'; }) ? 'ok' : 'degraded';
  res.json({ success: true, overall: overall, integrations: integrations, timestamp: new Date().toISOString() });
});

// ── GET /api/taskbus/providers/status ─────────────────────────────────────────
app.get('/providers/status', async function(req, res) {
  try {
    var status = await getProvidersStatus();
    var order  = (process.env.TASKBUS_PROVIDER_ORDER || 'deepseek,ollama,claude,smart_stub').split(',');
    res.json({ success: true, provider_order: order, providers: status });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/task ────────────────────────────────────────────────────
// Body: { title, instruction, assigned_agent, priority, required_output, approval_required, automation_mode, feature_ref, created_by }
app.post('/task', async function(req, res) {
  try {
    const task = store.createTask(req.body);
    log('[taskbus] Task created:', task.id, '|', task.title);
    // Auto-route if not manual
    if (task.automation_mode !== 'manual') {
      const result = await router.routeTask(task.id);
      return res.json({ success: true, task, routing: result });
    }
    res.json({ success: true, task, routing: { status: 'manual', note: 'Task created. No auto-routing for manual mode.' } });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/taskbus/tasks ────────────────────────────────────────────────────
app.get('/tasks', function(req, res) {
  const filter = {};
  if (req.query.status)         filter.status         = req.query.status;
  if (req.query.assigned_agent) filter.assigned_agent = req.query.assigned_agent;
  if (req.query.priority)       filter.priority       = req.query.priority;
  res.json({ success: true, tasks: store.getTasks(filter) });
});

// ── GET /api/taskbus/task/:id ─────────────────────────────────────────────────
app.get('/task/:id', function(req, res) {
  const task = store.getTask(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
  const messages = store.getMessages(req.params.id);
  const results  = store.getResults(req.params.id);
  res.json({ success: true, task, messages, results });
});

// ── PATCH /api/taskbus/task/:id ───────────────────────────────────────────────
app.patch('/task/:id', function(req, res) {
  const task = store.updateTask(req.params.id, req.body);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
  res.json({ success: true, task });
});

// ── POST /api/taskbus/task/:id/route ─────────────────────────────────────────
app.post('/task/:id/route', async function(req, res) {
  try {
    const result = await router.routeTask(req.params.id);
    res.json({ success: true, result });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/task/:id/result ────────────────────────────────────────
// Body: { agent, summary, output, files_changed, risks, next_request }
app.post('/task/:id/result', function(req, res) {
  const task = store.getTask(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
  const submitted = Object.assign({}, req.body);
  const hasTrustworthyRealAiFlag = submitted.provider_used && submitted.provider_used !== 'manual'
    && typeof submitted.is_real_ai_result === 'boolean';
  const result = store.addResult(Object.assign({
    task_id: req.params.id,
    provider_used: 'manual',
    cost_tier: 'manual',
    is_real_ai_result: false,
    provider_chain_attempted: ['manual'],
  }, submitted, {
    provider_used: submitted.provider_used || 'manual',
    cost_tier: submitted.cost_tier || 'manual',
    is_real_ai_result: hasTrustworthyRealAiFlag ? submitted.is_real_ai_result : false,
    provider_chain_attempted: Array.isArray(submitted.provider_chain_attempted) && submitted.provider_chain_attempted.length
      ? submitted.provider_chain_attempted
      : ['manual'],
  }));
  res.json({ success: true, result });
});

// ── POST /api/taskbus/task/:id/message ───────────────────────────────────────
// Body: { from_agent, to_agent, content }
app.post('/task/:id/message', function(req, res) {
  const msg = store.addMessage(req.params.id, req.body.from_agent, req.body.to_agent, req.body.content);
  res.json({ success: true, message: msg });
});

// ── GET /api/taskbus/approvals ────────────────────────────────────────────────
app.get('/approvals', function(req, res) {
  res.json({ success: true, approvals: store.getPendingApprovals() });
});

// ── POST /api/taskbus/approval/:id ───────────────────────────────────────────
// Body: { decision: 'approved'|'rejected', notes }
app.post('/approval/:id', function(req, res) {
  const approver = req.headers['x-approver'] || 'Shayan';
  if (approver !== 'Shayan') return res.status(403).json({ success: false, error: 'Only Shayan can approve' });
  const approval = store.resolveApproval(req.params.id, req.body.decision, approver, req.body.notes);
  if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });
  res.json({ success: true, approval });
});

// ── GET /api/taskbus/results ──────────────────────────────────────────────────
app.get('/results', function(req, res) {
  const taskId = req.query.task_id;
  if (taskId) return res.json({ success: true, results: store.getResults(taskId) });
  const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
  res.json({ success: true, results: store.getAllResults(limit), limit });
});

module.exports = app;
