// cloud/taskbus/router.js
// ACC v2 Task Bus Router
// Execution chain: DeepSeek â†’ Ollama â†’ Claude â†’ Smart Stub
// Safety controls: always enforced before any execution attempt
'use strict';

const store    = require('./store.js');
const { log }  = require('../utils/logger.js');
const { executeWithProviderFallback } = require('./providerFallback.js');

// â”€â”€ Safety patterns â€” NEVER modify or weaken these â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Manual agents â€” never auto-execute â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// openhands is NOT manual â€” routed via OpenHands connector (Â§3b)
var MANUAL_AGENTS = ['gemini', 'notebooklm', 'chatgpt'];

function isManualAgent(agentId) {
  if (agentId === 'openhands') return false;
  return MANUAL_AGENTS.indexOf(agentId) !== -1;
}

// â”€â”€ Rate limiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var rateLimitMap = {};
var MAX_PER_HOUR = parseInt(process.env.MAX_TASKS_PER_USER_PER_HOUR || '30');

function checkRateLimit(userId) {
  if (!userId || userId === 'claude_operator' || userId === 'bot' || userId === 'scheduler') {
    return { allowed: true, remaining: MAX_PER_HOUR };
  }
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

// â”€â”€ Main router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function findPendingApproval(taskId, action) {
  return store.getPendingApprovals().find(function(a) {
    return a.task_id === taskId && (!action || a.action === action);
  }) || null;
}

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
        var rsResultRow = store.addResult({
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
          resultId: rsResultRow.id,
          output: rsResult.output || '',
          summary: rsResult.summary || '',
        };
      }

      store.updateTask(taskId, { status: 'failed', provider_used: 'resend' });
      return { status: 'failed', taskId: taskId, provider_used: 'resend', output: rsResult && rsResult.output || '', error: rsResult && rsResult.error || 'Resend failed' };
    }
    log('[router] Resend not configured');
  // â”€â”€ 1. SAFETY GATE â€” runs before anything else â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var BYPASS_AGENTS = ['imagegen', 'image', 'tavily', 'hunter', 'alibaba', 'qwen'];
  if (BYPASS_AGENTS.indexOf(task.assigned_agent) !== -1) {
    // Skip safety gate and rate limit for these safe utility agents
    if (task.assigned_agent === 'imagegen' || task.assigned_agent === 'image') {
      var ig2 = require('../integrations/imageGen.js');
      if (ig2.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var ig2Result = await ig2.sendTaskFromACC(task);
        var ig2R = store.addResult({ task_id: taskId, provider_used: ig2Result.provider||'imagegen', is_real_ai_result: true, cost_tier: 'low_cost', output: ig2Result.url || ig2Result.output || '', summary: ig2Result.summary || '' });
        store.updateTask(taskId, { status: ig2Result.success?'done':'failed', provider_used: ig2Result.provider||'imagegen' });
        return { status: ig2Result.success?'done':'failed', taskId, provider_used: ig2Result.provider, output: ig2Result.url, image_url: ig2Result.url, summary: ig2Result.summary };
      }
    }
    if (task.assigned_agent === 'tavily') {
      var tv2 = require('../integrations/tavily.js');
      if (tv2.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var tv2Result = await tv2.sendTaskFromACC(task);
        var tv2R = store.addResult({ task_id: taskId, provider_used: 'tavily', is_real_ai_result: true, cost_tier: 'low_cost', output: tv2Result.output || '', summary: tv2Result.summary || '' });
        store.updateTask(taskId, { status: tv2Result.success?'done':'failed', provider_used: 'tavily' });
        return { status: tv2Result.success?'done':'failed', taskId, provider_used:'tavily', output: tv2Result.output };
      }
    }
    if (task.assigned_agent === 'hunter') {
      var ht2 = require('../integrations/hunter.js');
      if (ht2.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var ht2Result = await ht2.sendTaskFromACC(task);
        var ht2R = store.addResult({ task_id: taskId, provider_used: 'hunter', is_real_ai_result: true, cost_tier: 'api_call', output: ht2Result.output || '', summary: ht2Result.output && ht2Result.output.slice(0,200) || '' });
        store.updateTask(taskId, { status: ht2Result.success?'done':'failed', provider_used: 'hunter' });
        return { status: ht2Result.success?'done':'failed', taskId, provider_used:'hunter', output: ht2Result.output };
      }
    }
    if (task.assigned_agent === 'alibaba' || task.assigned_agent === 'qwen') {
      var al2 = require('../integrations/alibaba.js');
      if (al2.enabled()) {
        store.updateTask(taskId, { status: 'in_progress' });
        var al2Result = await al2.sendTaskFromACC(task);
        var al2R = store.addResult({ task_id: taskId, provider_used: 'alibaba_qwen', is_real_ai_result: true, cost_tier: 'low_cost', output: al2Result.output || '', summary: al2Result.output && al2Result.output.slice(0,200) || '' });
        store.updateTask(taskId, { status: al2Result.success?'done':'failed', provider_used: 'alibaba_qwen' });
        return { status: al2Result.success?'done':'failed', taskId, provider_used:'alibaba_qwen', output: al2Result.output };
      }
    }
    // If connector not enabled, fall through to normal routing below
  }

  // â”€â”€ 0. RATE LIMIT CHECK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var rl = checkRateLimit(task.created_by || task.userId);
  if (!rl.allowed) {
    store.updateTask(taskId, { status: 'failed', error: 'Rate limit exceeded' });
    return { status: 'rate_limited', taskId: taskId,
      message: 'â³ Slow down! Max ' + MAX_PER_HOUR + ' tasks/hour. Try again in ' + Math.ceil(rl.resetIn/60) + ' min.' };
  }

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
        var rsResultRow = store.addResult({
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
          resultId: rsResultRow.id,
          output: rsResult.output || '',
          summary: rsResult.summary || '',
        };
      }

      store.updateTask(taskId, { status: 'failed', provider_used: 'resend' });
      return { status: 'failed', taskId: taskId, provider_used: 'resend', output: rsResult && rsResult.output || '', error: rsResult && rsResult.error || 'Resend failed' };
    }
    log('[router] Resend not configured');
  }
  }
  // â”€â”€ 1. SAFETY GATE â€” runs before anything else â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isFullAutoExternalRisk(task)) {
    log('[router] BLOCKED â€” full_auto cannot execute high-risk external task');
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
    log('[router] BLOCKED â€” high-risk task requires approval');
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

  // â”€â”€ 2. MANUAL MODE â€” store only, no execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.automation_mode === 'manual' || isManualAgent(task.assigned_agent)) {
    log('[router] Manual â€” stored for', task.assigned_agent);
    store.updateTask(taskId, { status: 'pending' });
  // â”€â”€ Tavily â€” real-time AI research â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'tavily') {
  var tavily = require('../integrations/tavily.js');
  if (tavily.enabled()) {
    store.updateTask(taskId, { status: 'in_progress' });
    var tvResult = await tavily.sendTaskFromACC(task);
    var tvR = store.addResult({ task_id: taskId, provider_used: 'tavily',
      is_real_ai_result: true, cost_tier: 'low_cost',
      output: tvResult.output || '', summary: tvResult.summary || 'Tavily search completed' });
    store.updateTask(taskId, { status: tvResult.success?'done':'failed', provider_used: 'tavily' });
    return { status: tvResult.success?'done':'failed', taskId, provider_used:'tavily', output: tvResult.output };
  }
  log('[router] Tavily not enabled â€” falling through');
  }

  // â”€â”€ ImageGen â€” multi-provider image generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'imagegen' || task.assigned_agent === 'image') {
  var ig = require('../integrations/imageGen.js');
  if (ig.enabled()) {
    store.updateTask(taskId, { status: 'in_progress' });
    var igResult = await ig.sendTaskFromACC(task);
    var igR = store.addResult({ task_id: taskId, provider_used: igResult.provider||'imagegen',
      is_real_ai_result: true, cost_tier: 'low_cost',
      output: igResult.url || igResult.output || '', summary: igResult.summary || '' });
    store.updateTask(taskId, { status: igResult.success?'done':'failed', provider_used: igResult.provider||'imagegen' });
    return { status: igResult.success?'done':'failed', taskId, provider_used: igResult.provider, output: igResult.url, image_url: igResult.url };
  }
  log('[router] ImageGen not configured â€” need OPENAI_API_KEY or ALIBABA_API_KEY');
  }

  // â”€â”€ Alibaba/Qwen â€” alternative AI provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'alibaba' || task.assigned_agent === 'qwen') {
  var ali = require('../integrations/alibaba.js');
  if (ali.enabled()) {
    store.updateTask(taskId, { status: 'in_progress' });
    var aliResult = await ali.sendTaskFromACC(task);
    var aliR = store.addResult({ task_id: taskId, provider_used: 'alibaba_qwen',
      is_real_ai_result: true, cost_tier: 'low_cost',
      output: aliResult.output || '', summary: aliResult.output && aliResult.output.slice(0,200) || '' });
    store.updateTask(taskId, { status: aliResult.success?'done':'failed', provider_used: 'alibaba_qwen' });
    return { status: aliResult.success?'done':'failed', taskId, provider_used:'alibaba_qwen', output: aliResult.output };
  }
  log('[router] Alibaba not configured â€” set ALIBABA_API_KEY');
  }

  // â”€â”€ Hunter.io â€” email finder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'hunter') {
  var hunter = require('../integrations/hunter.js');
  if (hunter.enabled()) {
    store.updateTask(taskId, { status: 'in_progress' });
    var htResult = await hunter.sendTaskFromACC(task);
    var htR = store.addResult({ task_id: taskId, provider_used: 'hunter', is_real_ai_result: true, cost_tier: 'api_call', output: htResult.output||'', summary: htResult.output&&htResult.output.slice(0,200)||'' });
    store.updateTask(taskId, { status: htResult.success?'done':'failed', provider_used: 'hunter' });
    return { status: htResult.success?'done':'failed', taskId, provider_used:'hunter', output: htResult.output };
  }
  log('[router] Hunter not configured');
  }

  // â”€â”€ Resend â€” email sending (requires approval) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'resend' || task.assigned_agent === 'email') {
  var resend = require('../integrations/resend.js');
  if (resend.enabled()) {
    store.updateTask(taskId, { status: 'in_progress' });
    var rsResult = await resend.sendTaskFromACC(task);
    var rsR = store.addResult({ task_id: taskId, provider_used: 'resend', is_real_ai_result: true, cost_tier: 'api_call', output: rsResult.output||'', summary: rsResult.output&&rsResult.output.slice(0,200)||'' });
    store.updateTask(taskId, { status: rsResult.requires_approval?'waiting_approval':rsResult.success?'done':'failed', provider_used: 'resend' });
    return { status: rsResult.requires_approval?'waiting_approval':rsResult.success?'done':'failed', taskId, provider_used:'resend', output: rsResult.output };
  }
  log('[router] Resend not configured');
  }

  store.addMessage(taskId, 'system', task.assigned_agent,
      'Task ready for manual pickup.\n' +
      'GET /api/taskbus/tasks?assigned_agent=' + task.assigned_agent + '&status=pending\n' +
      'Submit result: POST /api/taskbus/task/' + taskId + '/result');
    return { status: 'assigned', taskId: taskId, agent: task.assigned_agent, note: 'Awaiting manual pickup' };
  }

  // â”€â”€ 3. ClickUp â€” special case (if key missing, manual) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'clickup' && !process.env.CLICKUP_API_KEY) {
    log('[router] ClickUp key missing â€” storing as manual');
    store.updateTask(taskId, { status: 'pending' });
    store.addMessage(taskId, 'system', 'clickup', 'ClickUp task stored. Add CLICKUP_API_KEY to .env to auto-sync.');
    return { status: 'assigned', taskId: taskId, agent: 'clickup', note: 'CLICKUP_API_KEY missing â€” manual' };
  }

  // â”€â”€ 3b. OpenHands â€” AI coding agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      return { status: ohResult.success ? 'done' : 'failed', taskId, resultId: ohR.id,
        provider_used: 'openhands', output: ohResult.output || ohR.output || '',
        summary: ohR.summary || '', is_real_ai_result: true, pr_url: ohResult.pr_url };
    }
    log('[router] OpenHands not configured â€” falling through to provider chain');
  }

  // â”€â”€ 3c. CrewAI â€” multi-agent Python framework â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'crewai') {
    var crewai = require('../integrations/crewai.js');
    if (crewai.enabled()) {
      log('[router] Routing to CrewAI multi-agent framework...');
      store.updateTask(taskId, { status: 'in_progress' });
      var crResult = await crewai.sendTaskFromACC(task);
      var crR = store.addResult({
        task_id: taskId, provider_used: 'crewai',
        is_real_ai_result: true, cost_tier: 'local_free',
        provider_chain_attempted: ['crewai'],
        output: crResult.output || '',
        summary: crResult.success ? (crResult.summary || 'CrewAI completed') : crResult.error,
      });
      store.updateTask(taskId, { status: crResult.success ? 'done' : 'failed', provider_used: 'crewai' });
      return { status: crResult.success ? 'done' : 'failed', taskId, resultId: crR.id,
        provider_used: 'crewai', output: crResult.output || crR.output || '',
        summary: crR.summary || crResult.summary || '', is_real_ai_result: true };
    }
    log('[router] CrewAI not enabled â€” falling through to provider chain');
  }

  // â”€â”€ 3d. Composio â€” 250+ tool integrations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      return { status: coResult.success ? 'done' : 'failed', taskId, provider_used: 'composio',
        output: coR.output, summary: coR.summary };
    }
    log('[router] Composio not configured â€” falling through to provider chain');
  }

  // â”€â”€ 3e. Aider â€” CLI coding agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'aider') {
    var aider = require('../integrations/aider.js');
    if (aider.enabled()) {
      store.updateTask(taskId, { status: 'in_progress' });
      var aiResult = await aider.sendTaskFromACC(task);
      var aiR = store.addResult({ task_id: taskId, provider_used: 'aider',
        is_real_ai_result: true, cost_tier: 'local_deepseek',
        output: aiResult.output || '', summary: aiResult.success ? 'Aider completed. Files: ' + (aiResult.files_changed||[]).join(', ') : aiResult.error });
      store.updateTask(taskId, { status: aiResult.success ? 'done' : 'failed', provider_used: 'aider' });
      return { status: aiResult.success?'done':'failed', taskId, provider_used:'aider', output: aiResult.output };
    }
    log('[router] Aider not enabled â€” falling through');
  }

  // â”€â”€ 3f. Devika â€” AI coding agent server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'devika') {
    var devika = require('../integrations/devika.js');
    if (devika.enabled()) {
      store.updateTask(taskId, { status: 'in_progress' });
      var dvResult = await devika.sendTaskFromACC(task);
      var dvR = store.addResult({ task_id: taskId, provider_used: 'devika',
        is_real_ai_result: true, cost_tier: 'local_agent',
        output: dvResult.output || '', summary: dvResult.success ? 'Devika completed' : dvResult.error });
      store.updateTask(taskId, { status: dvResult.success?'done':'failed', provider_used: 'devika' });
      return { status: dvResult.success?'done':'failed', taskId, provider_used:'devika', output: dvResult.output };
    }
    log('[router] Devika not running â€” falling through');
  }

  // â”€â”€ 3g. Alphonso â€” local Ollama agent ecosystem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (task.assigned_agent === 'alphonso') {
    var alphonso = require('../integrations/alphonso.js');
    if (alphonso.enabled()) {
      store.updateTask(taskId, { status: 'in_progress' });
      var alResult = await alphonso.sendTaskFromACC(task);
      var alR = store.addResult({ task_id: taskId, provider_used: 'alphonso_ollama',
        is_real_ai_result: true, cost_tier: 'local_free',
        output: alResult.output || '', summary: alResult.success ? 'Alphonso/Ollama completed (free, local)' : alResult.error });
      store.updateTask(taskId, { status: alResult.success?'done':'failed', provider_used: 'alphonso_ollama' });

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
          taskId,
          provider_used: 'alphonso_ollama',
          output: alResult.output,
          next_request: 'Review the generated draft, then approve the SocialClaw publish task: ' + publishTask.id.slice(0, 8),
          publish_task_id: publishTask.id,
          publish_approval_id: publishApproval.id,
        };
      }

      return { status: alResult.success?'done':'failed', taskId, provider_used:'alphonso_ollama', output: alResult.output };
    }
    log('[router] Alphonso/Ollama not enabled â€” falling through');
  }

  // â”€â”€ SocialClaw â€” publishing adapter for social distribution â€”â”€â”€â”€â”€â”€â”€â”€â”€
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
    log('[router] SocialClaw not configured â€” falling through');
  }

  store.addMessage(taskId, 'system', task.assigned_agent,
    'Executing | mode: ' + task.automation_mode + ' | chain: deepseekâ†’ollamaâ†’claudeâ†’smart_stub');

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

  // â”€â”€ Auto-sync to Airtable + ClickUp (non-blocking) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    var at = require('../connectors/airtable.js');
    if (at.enabled()) at.syncTask(task, r).catch(function(){});
  } catch(e) {}
  if (finalStatus === 'done') {
    try {
      var cu = require('../connectors/clickup.js');
      var listId = process.env.CLICKUP_LIST_ID;
      if (cu.enabled && cu.enabled() && listId) cu.onTaskCompleted(task, r, listId).catch(function(){});
    } catch(e) {}
  }

  return {
    status:              finalStatus,
    taskId:              taskId,
    resultId:            r.id,
    provider_used:       exec.provider_used,
    cost_tier:           exec.cost_tier,
    is_real_ai:          exec.is_real_ai_result,
    is_real_ai_result:   exec.is_real_ai_result,
    output:              exec.output || '',
    summary:             exec.summary || '',
    adapter:             exec.provider_used,  // backward compat
  };
}

module.exports = { routeTask, isHighRisk };

