// cloud/taskbus/routes.js
// REST API for ACC v2 Agent Task Bus
// Mount at: app.use('/api/taskbus', require('./taskbus/routes'));
'use strict';

const express = require('express');
const store   = require('./store.js');
const taskRouter = require('./router.js');
const { routeTask, notifyTelegramFailure } = taskRouter;
const { getProvidersStatus } = require('./providerFallback.js');
const { log } = require('../utils/logger.js');
const workflowRegistry = require('../workflows/registry.js');
const workflowDispatcher = require('../workflows/dispatcher.js');
const outreachCrm = require('../workflows/accOutreachCrmModule.js');
const socialclaw = require('../integrations/socialclaw.js');
const { runLeadCollectorPollerOnce } = require('../workflows/leadCollectorPoller.js');
const app     = express.Router();

function createExternalActionTask(input) {
  const task = store.createTask({
    title: input.title,
    instruction: input.instruction,
    assigned_agent: input.assigned_agent,
    priority: input.priority || 'high',
    required_output: input.required_output || '',
    approval_required: input.approval_required !== false,
    automation_mode: input.automation_mode || 'semi_auto',
    feature_ref: input.feature_ref || null,
    created_by: input.created_by || 'ui:mini',
    request_id: input.request_id || null,
    meta: input.meta || null,
  });
  return task;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise(function(_, reject) {
      setTimeout(function() {
        reject(new Error(label + ' timed out after ' + ms + 'ms'));
      }, ms);
    }),
  ]);
}

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
  var files = ['langfuse','openrouter','qdrant','sentry','helicone','n8n','supabase','browserbase','flowise','neo4j','openhands','crewai','grok','perplexity','airtable','clickup','socialclaw'];
  var checks = files.map(function(name) {
    return (async function() {
      try {
        var mod = require('../integrations/' + name + '.js');
        var health = await withTimeout(mod.checkHealth(), 2000, name + '.checkHealth');
        return [name, Object.assign({ enabled: mod.enabled() }, health)];
      } catch (e) {
        return [name, { enabled: false, status: 'error', error: e.message }];
      }
    })();
  });
  var results = await Promise.all(checks);
  results.forEach(function(entry) {
    integrations[entry[0]] = entry[1];
  });
  var statuses = Object.values(integrations).map(function(i) { return i.status; });
  var overall = statuses.every(function(s) { return s === 'connected' || s === 'disabled'; }) ? 'ok' : 'degraded';
  res.json({ success: true, overall: overall, integrations: integrations, timestamp: new Date().toISOString() });
});

// ── GET /api/taskbus/socialclaw/status ─────────────────────────────────────────
app.get('/socialclaw/status', async function(req, res) {
  try {
    const health = await socialclaw.checkHealth();
    res.json({
      success: true,
      socialclaw: Object.assign({ enabled: socialclaw.enabled() }, health),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/taskbus/socialclaw/accounts ──────────────────────────────────────
app.get('/socialclaw/accounts', async function(req, res) {
  try {
    const result = await socialclaw.listAccounts();
    res.json(Object.assign({ success: true, timestamp: new Date().toISOString() }, result));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/taskbus/socialclaw/usage ─────────────────────────────────────────
app.get('/socialclaw/usage', async function(req, res) {
  try {
    const result = await socialclaw.getUsage();
    res.json(Object.assign({ success: true, timestamp: new Date().toISOString() }, result));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/socialclaw/preview ──────────────────────────────────────
app.post('/socialclaw/preview', async function(req, res) {
  try {
    const result = await socialclaw.previewCampaign(req.body || {});
    res.json(Object.assign({ success: true, timestamp: new Date().toISOString() }, result));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/socialclaw/validate ─────────────────────────────────────
app.post('/socialclaw/validate', async function(req, res) {
  try {
    const result = await socialclaw.validateCampaign(req.body || {});
    res.json(Object.assign({ success: true, timestamp: new Date().toISOString() }, result));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/socialclaw/publish ──────────────────────────────────────
app.post('/socialclaw/publish', async function(req, res) {
  try {
    const body = req.body || {};
    const task = createExternalActionTask({
      title: body.title || 'SocialClaw publish campaign',
      instruction: body.instruction || 'Publish campaign through SocialClaw after operator approval.',
      assigned_agent: 'socialclaw',
      required_output: 'Publish confirmation and destination URL',
      feature_ref: 'api:taskbus:socialclaw:publish',
      created_by: body.created_by || 'ui:mini',
      request_id: body.request_id || null,
      meta: {
        socialclaw: { action: 'apply' },
        payload: Object.assign({}, body, { action: 'apply' }),
      },
    });
    const routing = await routeTask(task.id);
    res.json({ success: true, task, routing, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/socialclaw/delete ────────────────────────────────────────
app.post('/socialclaw/delete', async function(req, res) {
  try {
    const body = req.body || {};
    const task = createExternalActionTask({
      title: body.title || 'SocialClaw delete post',
      instruction: body.instruction || 'Delete a SocialClaw post after operator approval.',
      assigned_agent: 'socialclaw',
      required_output: 'Delete confirmation from SocialClaw',
      feature_ref: 'api:taskbus:socialclaw:delete',
      created_by: body.created_by || 'ui:mini',
      request_id: body.request_id || null,
      meta: {
        socialclaw: { action: 'posts:delete' },
        payload: Object.assign({}, body, { action: 'posts:delete' }),
      },
    });
    const routing = await routeTask(task.id);
    res.json({ success: true, task, routing, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
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

// ── GET /api/taskbus/workflows ─────────────────────────────────────────────────
app.get('/workflows', function(req, res) {
  try {
    const workflows = workflowRegistry.listWorkflows();
    res.json({
      success: true,
      total: workflows.length,
      workflows: workflows,
      catalog: workflowDispatcher.describeWorkflowCatalog(),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/workflow/run ────────────────────────────────────────────
// Body: { workflow: <key|id|name>, input?, created_by?, priority? }
app.post('/workflow/run', async function(req, res) {
  try {
    var b = req.body || {};
    if (!b.workflow) return res.status(400).json({ success: false, error: 'workflow key required' });
    var result = await workflowDispatcher.launchWorkflow(b.workflow, {
      input:      b.input      || '',
      created_by: b.created_by || 'ui:mini',
      priority:   b.priority   || 'normal',
    });
    if (!result.success) return res.status(404).json(result);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/taskbus/workflow/run/parallel ───────────────────────────────────
// Body: { workflows: [<key>, ...], input?, created_by? }
app.post('/workflow/run/parallel', async function(req, res) {
  try {
    var b = req.body || {};
    if (!Array.isArray(b.workflows) || !b.workflows.length)
      return res.status(400).json({ success: false, error: 'workflows array required' });
    var result = await workflowDispatcher.launchWorkflowsInParallel(b.workflows, {
      input:      b.input      || '',
      created_by: b.created_by || 'ui:mini',
      priority:   b.priority   || 'normal',
    });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// —— GET /api/taskbus/workflow/outreach-crm/health ——————————————————————————————
app.get('/workflow/outreach-crm/health', function(req, res) {
  try {
    res.json({ success: true, health: outreachCrm.health() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// —— POST /api/taskbus/workflow/outreach-crm/bootstrap ——————————————————————————
// Body: { sheetCsvUrl?, maxLeads?, sink?: none|airtable|clickup|both, clickupListId?, createdBy? }
app.post('/workflow/outreach-crm/bootstrap', async function(req, res) {
  try {
    const requestId = req.headers['x-request-id'] || req.body.requestId || ('req-' + Date.now());
    const result = await outreachCrm.bootstrapOutreachCrm({
      requestId: requestId,
      sheetCsvUrl: req.body.sheetCsvUrl,
      maxLeads: req.body.maxLeads,
      sink: req.body.sink || 'none',
      clickupListId: req.body.clickupListId,
      createdBy: req.body.createdBy || 'chatgpt'
    });
    if (!result.success) return res.status(500).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// —— POST /api/taskbus/workflow/outreach-crm/poller/run ———————————————————————
app.post('/workflow/outreach-crm/poller/run', async function(req, res) {
  try {
    await runLeadCollectorPollerOnce();
    res.json({ success: true, message: 'Lead collector poller run triggered.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Internal-caller verification (rate limit bypass) ─────────────────────────
// The INTERNAL_SERVICE_TOKEN env var is a shared secret only known to server-side
// processes (worker loop, scheduler). It is NEVER derived from task body fields.
var INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

function isInternalCaller(req) {
  if (!INTERNAL_TOKEN) return false; // bypass disabled when token not configured
  var header = req.headers['x-internal-token'] || '';
  return header === INTERNAL_TOKEN;
}

// ── POST /api/taskbus/task ────────────────────────────────────────────────────
// Body: { title, instruction, assigned_agent, priority, required_output, approval_required, automation_mode, feature_ref, created_by }
app.post('/task', async function(req, res) {
  try {
    const task = store.createTask(req.body);
    log('[taskbus] Task created:', task.id, '|', task.title);
    // Auto-route if not manual
    if (task.automation_mode !== 'manual') {
      const routeOpts = { skipRateLimit: isInternalCaller(req) };
      const result = await routeTask(task.id, routeOpts);
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
    const result = await routeTask(req.params.id);
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
// Auth delegated to server-level auth middleware.
app.post('/approval/:id', function(req, res) {
  (async function() {
    const approver = req.auth?.subject || 'operator';
    const approval = store.resolveApproval(req.params.id, req.body.decision, approver, req.body.notes);
    if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });

    if (req.body.decision === 'approved') {
      const routeResult = await routeTask(approval.task_id);
      // Best-effort failure notification — operator must know when post-approval execution fails
      if (routeResult && routeResult.status === 'failed') {
        const failedTask = store.getTask(approval.task_id);
        notifyTelegramFailure(approval.task_id, failedTask && failedTask.title, routeResult.error || routeResult.status);
      }
      return res.json({ success: true, approval, routeResult });
    }

    return res.json({ success: true, approval });
  })().catch(function(e) {
    if (e.message === 'approval_expired')
      return res.status(410).json({ success: false, error: 'Approval has expired. Task must be re-submitted for a fresh approval.' });
    if (e.message === 'action_payload_modified')
      return res.status(409).json({ success: false, error: 'Task payload was modified after this approval was created. Re-submit the task.' });
    res.status(500).json({ success: false, error: e.message });
  });
});

// ── POST /api/taskbus/task/:id/retry ─────────────────────────────────────────
// Re-routes a failed task. Resets status to pending then calls routeTask.
// Only tasks in 'failed' or stale 'waiting_approval' status can be retried.
app.post('/task/:id/retry', async function(req, res) {
  try {
    const task = store.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    if (task.status !== 'failed' && task.status !== 'waiting_approval') {
      return res.status(409).json({ success: false, error: 'Only failed or waiting_approval tasks can be retried. Current status: ' + task.status });
    }
    // Reset to pending + clear error so the safety gate re-evaluates cleanly
    store.updateTask(task.id, { status: 'pending', error: '' });
    log('[taskbus] Retrying task:', task.id.slice(0, 8), '| was:', task.status);
    const result = await routeTask(task.id);
    return res.json({ success: true, retried: task.id, previous_status: task.status, result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/taskbus/results ──────────────────────────────────────────────────
app.get('/results', function(req, res) {
  const taskId = req.query.task_id;
  if (taskId) return res.json({ success: true, results: store.getResults(taskId) });
  const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
  res.json({ success: true, results: store.getAllResults(limit), limit });
});

module.exports = app;
