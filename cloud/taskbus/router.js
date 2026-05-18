// cloud/taskbus/router.js
// ACC v2 Task Bus Router
// Execution chain: DeepSeek → Ollama → Claude → Smart Stub
// Safety controls: always enforced before any execution attempt
'use strict';

const store    = require('./store.js');
const { log }  = require('../utils/logger.js');
const { executeWithProviderFallback } = require('./providerFallback.js');

// ── Safety patterns — NEVER modify or weaken these ───────────────────────────
const HIGH_RISK_PATTERNS = [
  /post.*kijiji/i,       // marketplace live post
  /send.*email/i,        // external communication
  /publish/i,            // any public publishing
  /\bdelete\b/i,         // data deletion
  /payment/i,            // financial transaction
  /billing/i,            // billing action
  /deploy.*live/i,       // live deployment
  /linkedin.*apply/i,    // job application submission
  /external.*message/i,  // outreach messaging
  /outreach/i,           // any outreach campaign
  /go.*live/i,           // canary enable
  /canary.*enable/i,     // canary enable
  /credit.card/i,        // payment info
  /bank.account/i,       // financial
];

function isHighRisk(task) {
  if (task.approval_required === true) return true;
  var text = ((task.title || '') + ' ' + (task.instruction || '')).toLowerCase();
  return HIGH_RISK_PATTERNS.some(function(p) { return p.test(text); });
}

function isFullAutoExternalRisk(task) {
  if (task.automation_mode !== 'full_auto') return false;
  return isHighRisk(task);
}

// ── Manual agents — never auto-execute ───────────────────────────────────────
var MANUAL_AGENTS = ['gemini', 'notebooklm', 'chatgpt'];

function isManualAgent(agentId) {
  return MANUAL_AGENTS.indexOf(agentId) !== -1;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
var rateLimitMap = {};
var MAX_PER_HOUR = parseInt(process.env.MAX_TASKS_PER_USER_PER_HOUR || '30');

function checkRateLimit(userId) {
  if (!userId || userId === 'claude_operator' || userId === 'bot') return { allowed: true, remaining: MAX_PER_HOUR };
  var now = Date.now();
  var hour = 3600000;
  var times = (rateLimitMap[userId] || []).filter(function(t){ return now - t < hour; });
  rateLimitMap[userId] = times;
  if (times.length >= MAX_PER_HOUR) {
    var oldest = times[0];
    var resetIn = Math.ceil((oldest + hour - now) / 1000);
    return { allowed: false, remaining: 0, resetIn: resetIn };
  }
  rateLimitMap[userId].push(now);
  return { allowed: true, remaining: MAX_PER_HOUR - times.length - 1 };
}

// ── Main router ───────────────────────────────────────────────────────────────
async function routeTask(taskId) {
  var task = store.getTask(taskId);
  if (!task) {
    log('[router] Task not found:', taskId);
    return { status: 'error', error: 'Task not found', taskId: taskId };
  }

  log('[router] Routing:', task.id.slice(0,8),
    '| "' + task.title.slice(0,45) + '"',
    '| agent:', task.assigned_agent,
    '| mode:', task.automation_mode);

  // ── 0. RATE LIMIT CHECK ────────────────────────────────────────────────────
  var rl = checkRateLimit(task.created_by || task.userId);
  if (!rl.allowed) {
    store.updateTask(taskId, { status: 'failed', error: 'Rate limit exceeded' });
    return { status: 'rate_limited', taskId: taskId,
      message: '⏳ Slow down! Max ' + MAX_PER_HOUR + ' tasks/hour. Try again in ' + Math.ceil(rl.resetIn/60) + ' min.' };
  }

  // ── 1. SAFETY GATE — runs before anything else ─────────────────────────────
  if (isFullAutoExternalRisk(task)) {
    log('[router] BLOCKED — full_auto cannot execute high-risk external task');
    store.updateTask(taskId, { status: 'waiting_approval', automation_mode: 'sandbox' });
    var fullAutoApproval = store.createApproval(taskId, 'high_risk_execution');
    store.addMessage(taskId, 'system', 'human', [
      'APPROVAL REQUIRED',
      'Task: ' + task.title,
      'Reason: full_auto is internal/local only and cannot execute high-risk external actions.',
      'Mode changed to sandbox before approval routing.',
      'Approval ID: ' + fullAutoApproval.id.slice(0, 8),
    ].join('\n'));
    return { status: 'waiting_approval', taskId: taskId, approvalId: fullAutoApproval.id };
  }

  if (isHighRisk(task) && !store.hasApprovedApproval(taskId, 'high_risk_execution')) {
    log('[router] BLOCKED — high-risk task requires approval');
    store.updateTask(taskId, { status: 'waiting_approval' });
    var approval = store.createApproval(taskId, 'high_risk_execution');
    store.addMessage(taskId, 'system', 'human', [
      'APPROVAL REQUIRED',
      'Task: ' + task.title,
      'Reason: High-risk pattern detected in title/instruction',
      'Mode: ' + task.automation_mode,
      'Approval ID: ' + approval.id.slice(0, 8),
      'Approve: /taskbus_approve_' + approval.id.slice(0, 8),
      'Reject:  /taskbus_reject_'  + approval.id.slice(0, 8),
    ].filter(Boolean).join('\n'));
    return { status: 'waiting_approval', taskId: taskId, approvalId: approval.id };
  }

  // ── 2. MANUAL MODE — store only, no execution ──────────────────────────────
  if (task.automation_mode === 'manual' || isManualAgent(task.assigned_agent)) {
    log('[router] Manual — stored for', task.assigned_agent);
    store.updateTask(taskId, { status: 'pending' });
    store.addMessage(taskId, 'system', task.assigned_agent,
      'Task ready for manual pickup.\n' +
      'GET /api/taskbus/tasks?assigned_agent=' + task.assigned_agent + '&status=pending\n' +
      'Submit result: POST /api/taskbus/task/' + taskId + '/result');
    return { status: 'assigned', taskId: taskId, agent: task.assigned_agent, note: 'Awaiting manual pickup' };
  }

  // ── 3. ClickUp — special case (if key missing, manual) ────────────────────
  if (task.assigned_agent === 'clickup' && !process.env.CLICKUP_API_KEY) {
    log('[router] ClickUp key missing — storing as manual');
    store.updateTask(taskId, { status: 'pending' });
    store.addMessage(taskId, 'system', 'clickup', 'ClickUp task stored. Add CLICKUP_API_KEY to .env to auto-sync.');
    return { status: 'assigned', taskId: taskId, agent: 'clickup', note: 'CLICKUP_API_KEY missing — manual' };
  }

  // ── 4. AUTO-EXECUTE via provider fallback chain ────────────────────────────
  store.updateTask(taskId, { status: 'in_progress' });
  store.addMessage(taskId, 'system', task.assigned_agent,
    'Executing | mode: ' + task.automation_mode + ' | chain: deepseek→ollama→claude→smart_stub');

  var exec = await executeWithProviderFallback(task);

  // Store full result with provider metadata
  var r = store.addResult({
    task_id:                  taskId,
    agent:                    task.assigned_agent,

    // Provider metadata (required by spec)
    provider_used:            exec.provider_used,
    provider_chain_attempted: exec.provider_chain_attempted,
    fallback_reason:          exec.fallback_reason,
    execution_mode:           exec.execution_mode,
    cost_tier:                exec.cost_tier,
    is_real_ai_result:        exec.is_real_ai_result,

    // Task result
    summary:                  exec.summary,
    output:                   exec.output,
    files_changed:            exec.files_changed || [],
    risks:                    exec.risks || [],
    next_request:             exec.next_request,
  });

  // Update task status
  var finalStatus = task.approval_required ? 'waiting_approval' : 'done';
  store.updateTask(taskId, {
    status:       finalStatus,
    provider_used: exec.provider_used,
  });

  // Notify chatgpt (orchestrator) via message
  store.addMessage(taskId, exec.provider_used, 'chatgpt', [
    '[' + exec.provider_used.toUpperCase() + '] Task complete',
    'Result: ' + r.id.slice(0, 8),
    'Provider: ' + exec.provider_used + ' | Real AI: ' + exec.is_real_ai_result,
    'Cost tier: ' + exec.cost_tier,
    'Summary: ' + exec.summary,
    exec.next_request ? 'Next: ' + exec.next_request : '',
  ].filter(Boolean).join('\n'));

  log('[router] Task', taskId.slice(0,8), 'done |',
    'provider:', exec.provider_used,
    '| real_ai:', exec.is_real_ai_result,
    '| cost:', exec.cost_tier);

  return {
    status:        finalStatus,
    taskId:        taskId,
    resultId:      r.id,
    provider_used: exec.provider_used,
    cost_tier:     exec.cost_tier,
    is_real_ai:    exec.is_real_ai_result,
    adapter:       exec.provider_used,  // backward compat
  };
}

module.exports = { routeTask, isHighRisk };
