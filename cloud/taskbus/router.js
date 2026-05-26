// cloud/taskbus/router.js
// ACC v2 Task Bus Router
// Execution chain: DeepSeek → Ollama → Alibaba → Smart Stub
// Safety controls: always enforced before any execution attempt
'use strict';

const store    = require('./store.js');
const { log }  = require('../utils/logger.js');
const { executeWithProviderFallback } = require('./providerFallback.js');

// ── Safety patterns – NEVER modify or weaken these ────────────────────────────
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

// ── Manual agents – never auto-execute ───────────────────────────────────────
// openhands is NOT manual – routed via OpenHands connector
var MANUAL_AGENTS = ['gemini', 'notebooklm', 'chatgpt'];

function isManualAgent(agentId) {
  if (agentId === 'openhands') return false;
  return MANUAL_AGENTS.indexOf(agentId) !== -1;
}

// ── Rate limiting (in-memory; resets on restart) ──────────────────────────────
var rateLimitMap = {};
var MAX_PER_HOUR = parseInt(process.env.MAX_TASKS_PER_USER_PER_HOUR || '30');

// NOTE: bypass is NOT based on user-supplied fields (created_by, userId).
// Callers must pass skipRateLimit:true via opts, which is only set by the
// routes layer after verifying a server-side INTERNAL_SERVICE_TOKEN header.
function checkRateLimit(userId) {
  if (!userId) return { allowed: true, remaining: MAX_PER_HOUR };
  var now  = Date.now();
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function findPendingApproval(taskId, action) {
  return store.getPendingApprovals().find(function(a) {
    return a.task_id === taskId && (!action || a.action === action);
  }) || null;
}

// ── Main router ───────────────────────────────────────────────────────────────
// opts.skipRateLimit — only set by the routes layer after verifying a server-side
//   INTERNAL_SERVICE_TOKEN header. Never derived from user-supplied task fields.
async function routeTask(taskId, opts) {
  var skip = opts && opts.skipRateLimit === true;
  var task = store.getTask(taskId);
  if (!task) {
    log('[router] Task not found:', taskId);
    return { status: 'error', error: 'Task not found', taskId: taskId };
  }

  log('[router] Routing:', task.id.slice(0, 8),
    '| "' + task.title.slice(0, 45) + '"',
    '| agent:', task.assigned_agent,
    '| mode:', task.automation_mode);

  // ── STEP 1: BYPASS AGENTS – skip safety gate and rate limit ─────────────────
  // These are safe utility agents (no external side-effects) that should never
  // be blocked by the approval gate.
  var BYPASS_AGENTS = ['imagegen', 'image', 'tavily', 'hunter', 'alibaba', 'qwen'];
  if (BYPASS_AGENTS.indexOf(task.assigned_agent) !== -1) {
    if (task.assigned_agent === 'imagegen' || task.assigned_agent === 'image') {
      var ig = require('../integrations/imageGen.js');
      if (ig.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var igResult = await ig.sendTaskFromACC(task);
        store.addResult({ task_id: taskId, provider_used: igResult.provider || 'imagegen', is_real_ai_result: true, cost_tier: 'low_cost', output: igResult.url || igResult.output || '', summary: igResult.summary || '' });
        store.updateTask(taskId, { status: igResult.success ? 'done' : 'failed', provider_used: igResult.provider || 'imagegen' });
        return { status: igResult.success ? 'done' : 'failed', taskId: taskId, provider_used: igResult.provider, output: igResult.url, image_url: igResult.url, summary: igResult.summary };
      }
      log('[router] ImageGen not configured – need OPENAI_API_KEY or ALIBABA_API_KEY');
    }

    if (task.assigned_agent === 'tavily') {
      var tv = require('../integrations/tavily.js');
      if (tv.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var tvResult = await tv.sendTaskFromACC(task);
        store.addResult({ task_id: taskId, provider_used: 'tavily', is_real_ai_result: true, cost_tier: 'low_cost', output: tvResult.output || '', summary: tvResult.summary || 'Tavily search completed' });
        store.updateTask(taskId, { status: tvResult.success ? 'done' : 'failed', provider_used: 'tavily' });
        return { status: tvResult.success ? 'done' : 'failed', taskId: taskId, provider_used: 'tavily', output: tvResult.output };
      }
      log('[router] Tavily not enabled – falling through');
    }

    if (task.assigned_agent === 'hunter') {
      var ht = require('../integrations/hunter.js');
      if (ht.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var htResult = await ht.sendTaskFromACC(task);
        store.addResult({ task_id: taskId, provider_used: 'hunter', is_real_ai_result: true, cost_tier: 'api_call', output: htResult.output || '', summary: htResult.output && htResult.output.slice(0, 200) || '' });
        store.updateTask(taskId, { status: htResult.success ? 'done' : 'failed', provider_used: 'hunter' });
        return { status: htResult.success ? 'done' : 'failed', taskId: taskId, provider_used: 'hunter', output: htResult.output };
      }
      log('[router] Hunter not configured');
    }

    if (task.assigned_agent === 'alibaba' || task.assigned_agent === 'qwen') {
      var ali = require('../integrations/alibaba.js');
      if (ali.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var aliResult = await ali.sendTaskFromACC(task);
        store.addResult({ task_id: taskId, provider_used: 'alibaba_qwen', is_real_ai_result: true, cost_tier: 'low_cost', output: aliResult.output || '', summary: aliResult.output && aliResult.output.slice(0, 200) || '' });
        store.updateTask(taskId, { status: aliResult.success ? 'done' : 'failed', provider_used: 'alibaba_qwen' });
        return { status: aliResult.success ? 'done' : 'failed', taskId: taskId, provider_used: 'alibaba_qwen', output: aliResult.output };
      }
      log('[router] Alibaba not configured – set ALIBABA_API_KEY');
    }

    // Connector not enabled – fall through to normal routing below
  }

  // ── STEP 2: RATE LIMIT CHECK ─────────────────────────────────────────────────
  var rl = skip ? { allowed: true, remaining: MAX_PER_HOUR } : checkRateLimit(task.created_by || task.userId);
  if (!rl.allowed) {
    store.updateTask(taskId, { status: 'failed', error: 'Rate limit exceeded' });
    return { status: 'rate_limited', taskId: taskId,
      message: '⏳ Slow down! Max ' + MAX_PER_HOUR + ' tasks/hour. Try again in ' + Math.ceil(rl.resetIn / 60) + ' min.' };
  }

  // ── STEP 3: RESEND / EMAIL – needs explicit approval before sending ───────────
  if (task.assigned_agent === 'resend' || task.assigned_agent === 'email') {
    var resend = require('../integrations/resend.js');
    if (resend.enabled()) {
      var resendApproved = store.hasApprovedApproval(taskId, 'high_risk_execution');
      store.updateTask(taskId, { status: 'in_progress' });
      var rsResult = await resend.sendTaskFromACC(task, { approved: resendApproved });

      if (rsResult && rsResult.requires_approval) {
        var resendApproval = findPendingApproval(taskId, 'high_risk_execution') || store.createApproval(taskId, 'high_risk_execution');
        store.updateTask(taskId, { status: 'waiting_approval', provider_used: 'resend' });
        store.addMessage(taskId, 'system', 'human', [
          'APPROVAL REQUIRED',
          'Task: ' + task.title,
          'Reason: Sending email is a high-risk external action.',
          'Approval ID: ' + resendApproval.id.slice(0, 8),
          'Approve: /taskbus_approve_' + resendApproval.id.slice(0, 8),
          'Reject:  /taskbus_reject_'  + resendApproval.id.slice(0, 8),
        ].join('\n'));
        return {
          status: 'waiting_approval',
          taskId: taskId,
          approvalId: resendApproval.id,
          provider_used: 'resend',
          output: rsResult.output || '',
          summary: rsResult.summary || 'Email awaiting approval',
        };
      }

      if (rsResult && rsResult.success) {
        var rsRow = store.addResult({
          task_id: taskId,
          provider_used: 'resend',
          is_real_ai_result: true,
          cost_tier: 'api_call',
          output: rsResult.output || '',
          summary: rsResult.summary || (rsResult.output && rsResult.output.slice(0, 200)) || '',
        });
        store.updateTask(taskId, { status: 'done', provider_used: 'resend' });
        return {
          status: 'done',
          taskId: taskId,
          provider_used: 'resend',
          resultId: rsRow.id,
          output: rsResult.output || '',
          summary: rsResult.summary || '',
        };
      }

      store.updateTask(taskId, { status: 'failed', provider_used: 'resend' });
      return { status: 'failed', taskId: taskId, provider_used: 'resend', output: rsResult && rsResult.output || '', error: rsResult && rsResult.error || 'Resend failed' };
    }
    log('[router] Resend not configured');
    // Fall through to provider chain if resend is not configured
  }

  // ── STEP 4: SAFETY GATE – runs before execution ──────────────────────────────
  if (isFullAutoExternalRisk(task)) {
    log('[router] BLOCKED – full_auto cannot execute high-risk external task');
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
    log('[router] BLOCKED – high-risk task requires approval');
    store.updateTask(taskId, { status: 'waiting_approval' });
    var riskApproval = store.createApproval(taskId, 'high_risk_execution');
    store.addMessage(taskId, 'system', 'human', [
      'APPROVAL REQUIRED',
      'Task: ' + task.title,
      'Reason: High-risk pattern detected in title/instruction',
      'Mode: ' + task.automation_mode,
      'Approval ID: ' + riskApproval.id.slice(0, 8),
      'Approve: /taskbus_approve_' + riskApproval.id.slice(0, 8),
      'Reject:  /taskbus_reject_'  + riskApproval.id.slice(0, 8),
    ].filter(Boolean).join('\n'));
    return { status: 'waiting_approval', taskId: taskId, approvalId: riskApproval.id };
  }

  // ── STEP 5: MANUAL MODE – store only, no execution ───────────────────────────
  if (task.automation_mode === 'manual' || isManualAgent(task.assigned_agent)) {
    log('[router] Manual – stored for', task.assigned_agent);
    store.updateTask(taskId, { status: 'pending' });
    store.addMessage(taskId, 'system', task.assigned_agent,
      'Task ready for manual pickup.\n' +
      'GET /api/taskbus/tasks?assigned_agent=' + task.assigned_agent + '&status=pending\n' +
      'Submit result: POST /api/taskbus/task/' + taskId + '/result');
    return { status: 'assigned', taskId: taskId, agent: task.assigned_agent, note: 'Awaiting manual pickup' };
  }

  // ── STEP 6: ClickUp – special case (if key missing, treat as manual) ─────────
  if (task.assigned_agent === 'clickup' && !process.env.CLICKUP_API_KEY) {
    log('[router] ClickUp key missing – storing as manual');
    store.updateTask(taskId, { status: 'pending' });
    store.addMessage(taskId, 'system', 'clickup', 'ClickUp task stored. Add CLICKUP_API_KEY to .env to auto-sync.');
    return { status: 'assigned', taskId: taskId, agent: 'clickup', note: 'CLICKUP_API_KEY missing – manual' };
  }

  // ── STEP 7: OpenHands – AI coding agent ──────────────────────────────────────
  if (task.assigned_agent === 'openhands') {
    var oh = require('../integrations/openhands.js');
    if (oh.enabled()) {
      log('[router] Routing to OpenHands coding agent...');
      store.updateTask(taskId, { status: 'in_progress' });
      var ohResult = await oh.sendTaskFromACC(task);
      var ohR = store.addResult({
        task_id: taskId, provider_used: 'openhands',
        is_real_ai_result: true, cost_tier: 'external_agent',
        provider_chain_attempted: ['openhands'],
        output: ohResult.output || ohResult.pr_url || '',
        summary: ohResult.success ? 'OpenHands completed' + (ohResult.pr_url ? ': PR at ' + ohResult.pr_url : '') : ohResult.error,
      });
      store.updateTask(taskId, { status: ohResult.success ? 'done' : 'failed', provider_used: 'openhands' });
      return { status: ohResult.success ? 'done' : 'failed', taskId: taskId, resultId: ohR.id,
        provider_used: 'openhands', output: ohResult.output || ohR.output || '',
        summary: ohR.summary || '', is_real_ai_result: true, pr_url: ohResult.pr_url };
    }
    log('[router] OpenHands not configured – falling through to provider chain');
  }

  // ── STEP 8: CrewAI – multi-agent Python framework ────────────────────────────
  if (task.assigned_agent === 'crewai') {
    var crewai = require('../integrations/crewai.js');
    if (crewai.enabled()) {
      log('[router] Routing to CrewAI...');
      store.updateTask(taskId, { status: 'in_progress' });

      var crResult;
      // If the task has a workflow_key, use the registry entrypoint (project-specific main.py).
      // Otherwise fall back to the generic crewai_agent.py connector.
      if (task.meta && task.meta.workflow_key) {
        var dispatcher = require('../workflows/dispatcher.js');
        crResult = await dispatcher.executeWorkflowTask(task);
      } else {
        crResult = await crewai.sendTaskFromACC(task);
      }

      var crR = store.addResult({
        task_id: taskId, provider_used: 'crewai',
        is_real_ai_result: crResult.is_real_ai_result !== false,
        cost_tier: 'local_free',
        provider_chain_attempted: ['crewai'],
        output: crResult.output || '',
        summary: crResult.success ? (crResult.summary || 'CrewAI completed') : (crResult.error || 'CrewAI failed'),
      });
      store.updateTask(taskId, { status: crResult.success ? 'done' : 'failed', provider_used: 'crewai' });
      return {
        status: crResult.success ? 'done' : 'failed',
        taskId: taskId, resultId: crR.id,
        provider_used: 'crewai',
        output: crResult.output || '',
        summary: crR.summary || crResult.summary || '',
        is_real_ai_result: crResult.is_real_ai_result !== false,
        execution_mode: crResult.execution_mode || 'execute',
      };
    }
    log('[router] CrewAI not enabled – falling through to provider chain');
  }

  // ── STEP 9: Composio – 250+ tool integrations ────────────────────────────────
  if (task.assigned_agent === 'composio') {
    var composio = require('../integrations/composio.js');
    if (composio.enabled()) {
      store.updateTask(taskId, { status: 'in_progress' });
      var coResult = await composio.sendTaskFromACC(task);
      var coR = store.addResult({ task_id: taskId, provider_used: 'composio',
        is_real_ai_result: true, cost_tier: 'external_agent',
        output: coResult.data ? JSON.stringify(coResult.data) : (coResult.hint || coResult.error || ''),
        summary: coResult.success ? 'Composio action completed' : (coResult.error || 'Composio needs app+action in meta') });
      store.updateTask(taskId, { status: coResult.success ? 'done' : 'failed', provider_used: 'composio' });
      return { status: coResult.success ? 'done' : 'failed', taskId: taskId, provider_used: 'composio',
        output: coR.output, summary: coR.summary };
    }
    log('[router] Composio not configured – falling through to provider chain');
  }

  // ── STEP 10: Aider – CLI coding agent ────────────────────────────────────────
  if (task.assigned_agent === 'aider') {
    var aider = require('../integrations/aider.js');
    if (aider.enabled()) {
      store.updateTask(taskId, { status: 'in_progress' });
      var aiderResult = await aider.sendTaskFromACC(task);
      var aiderR = store.addResult({ task_id: taskId, provider_used: 'aider',
        is_real_ai_result: true, cost_tier: 'local_deepseek',
        output: aiderResult.output || '', summary: aiderResult.success ? 'Aider completed. Files: ' + (aiderResult.files_changed || []).join(', ') : aiderResult.error });
      store.updateTask(taskId, { status: aiderResult.success ? 'done' : 'failed', provider_used: 'aider' });
      return { status: aiderResult.success ? 'done' : 'failed', taskId: taskId, provider_used: 'aider', output: aiderResult.output };
    }
    log('[router] Aider not enabled – falling through');
  }

  // ── STEP 11: Devika – AI coding agent server ─────────────────────────────────
  if (task.assigned_agent === 'devika') {
    var devika = require('../integrations/devika.js');
    if (devika.enabled()) {
      store.updateTask(taskId, { status: 'in_progress' });
      var dvResult = await devika.sendTaskFromACC(task);
      var dvR = store.addResult({ task_id: taskId, provider_used: 'devika',
        is_real_ai_result: true, cost_tier: 'local_agent',
        output: dvResult.output || '', summary: dvResult.success ? 'Devika completed' : dvResult.error });
      store.updateTask(taskId, { status: dvResult.success ? 'done' : 'failed', provider_used: 'devika' });
      return { status: dvResult.success ? 'done' : 'failed', taskId: taskId, provider_used: 'devika', output: dvResult.output };
    }
    log('[router] Devika not running – falling through');
  }

  // ── STEP 12: Alphonso – local Ollama agent ecosystem ─────────────────────────
  if (task.assigned_agent === 'alphonso') {
    var alphonso = require('../integrations/alphonso.js');
    if (alphonso.enabled()) {
      store.updateTask(taskId, { status: 'in_progress' });
      var alResult = await alphonso.sendTaskFromACC(task);
      store.addResult({ task_id: taskId, provider_used: 'alphonso_ollama',
        is_real_ai_result: true, cost_tier: 'local_free',
        output: alResult.output || '', summary: alResult.success ? 'Alphonso/Ollama completed (free, local)' : alResult.error });
      store.updateTask(taskId, { status: alResult.success ? 'done' : 'failed', provider_used: 'alphonso_ollama' });

      // Social publish pipeline handoff
      if (alResult.success && task.meta && task.meta.workflow_key === 'acc:social_publish_pipeline') {
        var publishPayload = {
          source: 'acc-social-publish-pipeline',
          workflow_key: 'acc:social_publish_pipeline',
          workflow_parent_task_id: taskId,
          title: task.title,
          content: alResult.output || '',
          caption: alResult.output || '',
          draft: alResult.output || '',
          prompt: task.instruction || task.title || '',
        };
        var publishTask = store.createTask({
          title: '[SocialClaw] Publish draft from ' + (task.title || 'ACC'),
          instruction: [
            'Publish the approved draft through SocialClaw.',
            'Draft content:',
            alResult.output || '',
            '',
            'Follow the ACC approval gate before publishing.',
          ].join('\n'),
          assigned_agent: 'socialclaw',
          priority: task.priority || 'high',
          required_output: 'Publish confirmation and destination URL',
          approval_required: true,
          automation_mode: 'semi_auto',
          feature_ref: 'workflow:acc:social_publish_pipeline',
          created_by: task.created_by || 'chatgpt',
          request_id: task.request_id || null,
          meta: Object.assign({}, task.meta || {}, {
            workflow_key: 'acc:social_publish_pipeline',
            workflow_kind: 'publishing_pipeline',
            workflow_stage: 'publish',
            workflow_parent_task_id: taskId,
            publish_payload: publishPayload,
            generated_by: 'alphonso',
          }),
        });
        var publishApproval = store.createApproval(publishTask.id, 'high_risk_execution');
        store.updateTask(publishTask.id, { status: 'waiting_approval' });
        store.addMessage(taskId, 'alphonso', 'socialclaw', [
          'Publish handoff prepared.',
          'Child task: ' + publishTask.id.slice(0, 8),
          'Approval ID: ' + publishApproval.id.slice(0, 8),
          'Approve the publish task from /approvals before SocialClaw runs.',
        ].join('\n'));
        return {
          status: 'done',
          taskId: taskId,
          provider_used: 'alphonso_ollama',
          output: alResult.output,
          next_request: 'Review the generated draft, then approve the SocialClaw publish task: ' + publishTask.id.slice(0, 8),
          publish_task_id: publishTask.id,
          publish_approval_id: publishApproval.id,
        };
      }

      return { status: alResult.success ? 'done' : 'failed', taskId: taskId, provider_used: 'alphonso_ollama', output: alResult.output };
    }
    log('[router] Alphonso/Ollama not enabled – falling through');
  }

  // ── STEP 13: SocialClaw – publishing adapter ──────────────────────────────────
  if (task.assigned_agent === 'socialclaw') {
    var socialclaw = require('../integrations/socialclaw.js');
    if (socialclaw.enabled()) {
      log('[router] Routing to SocialClaw publishing adapter...');
      store.updateTask(taskId, { status: 'in_progress' });
      var scResult = await socialclaw.sendTaskFromACC(task);
      var scOutput = typeof scResult.output === 'object' ? JSON.stringify(scResult.output) : (scResult.output || '');
      var scR = store.addResult({
        task_id: taskId,
        provider_used: 'socialclaw',
        is_real_ai_result: true,
        cost_tier: 'external_publisher',
        output: scOutput,
        summary: scResult.summary || (scResult.success ? 'SocialClaw publish completed' : scResult.error || 'SocialClaw setup required'),
      });
      store.updateTask(taskId, { status: scResult.success ? 'done' : 'failed', provider_used: 'socialclaw' });
      return {
        status: scResult.success ? 'done' : 'failed',
        taskId: taskId,
        provider_used: 'socialclaw',
        resultId: scR.id,
        output: scOutput,
        summary: scR.summary || '',
      };
    }
    log('[router] SocialClaw not configured – falling through');
  }

  // ── STEP 14: Provider fallback chain (DeepSeek → Ollama → Smart Stub) ────────
  store.addMessage(taskId, 'system', task.assigned_agent,
    'Executing | mode: ' + task.automation_mode + ' | chain: deepseek→ollama→alibaba→smart_stub');

  var exec = await executeWithProviderFallback(task);

  var r = store.addResult({
    task_id:                  taskId,
    agent:                    task.assigned_agent,
    provider_used:            exec.provider_used,
    provider_chain_attempted: exec.provider_chain_attempted,
    fallback_reason:          exec.fallback_reason,
    execution_mode:           exec.execution_mode,
    cost_tier:                exec.cost_tier,
    is_real_ai_result:        exec.is_real_ai_result,
    summary:                  exec.summary,
    output:                   exec.output,
    files_changed:            exec.files_changed || [],
    risks:                    exec.risks || [],
    next_request:             exec.next_request,
  });

  var finalStatus = task.approval_required ? 'waiting_approval' : 'done';
  store.updateTask(taskId, {
    status:        finalStatus,
    provider_used: exec.provider_used,
  });

  store.addMessage(taskId, exec.provider_used, 'chatgpt', [
    '[' + exec.provider_used.toUpperCase() + '] Task complete',
    'Result: ' + r.id.slice(0, 8),
    'Provider: ' + exec.provider_used + ' | Real AI: ' + exec.is_real_ai_result,
    'Cost tier: ' + exec.cost_tier,
    'Summary: ' + exec.summary,
    exec.next_request ? 'Next: ' + exec.next_request : '',
  ].filter(Boolean).join('\n'));

  log('[router] Task', taskId.slice(0, 8), 'done |',
    'provider:', exec.provider_used,
    '| real_ai:', exec.is_real_ai_result,
    '| cost:', exec.cost_tier);

  // ── Auto-sync to Airtable + ClickUp (non-blocking, best-effort) ───────────────
  try {
    var at = require('../connectors/airtable.js');
    if (at.enabled()) at.syncTask(task, r).catch(function() {});
  } catch (e) {}

  if (finalStatus === 'done') {
    try {
      var cu = require('../connectors/clickup.js');
      var listId = process.env.CLICKUP_LIST_ID;
      if (cu.enabled && cu.enabled() && listId) cu.onTaskCompleted(task, r, listId).catch(function() {});
    } catch (e) {}
  }

  return {
    status:            finalStatus,
    taskId:            taskId,
    resultId:          r.id,
    provider_used:     exec.provider_used,
    cost_tier:         exec.cost_tier,
    is_real_ai:        exec.is_real_ai_result,
    is_real_ai_result: exec.is_real_ai_result,
    output:            exec.output || '',
    summary:           exec.summary || '',
    adapter:           exec.provider_used,  // backward compat
  };
}

module.exports = { routeTask, isHighRisk };
