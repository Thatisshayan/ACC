// cloud/taskbus/telegramCommands.js
// ACC v2 Task Bus — Telegram command layer
// Fixed: all messages use plain sendFn without Markdown special chars in IDs
// All handlers wrapped in try/catch with clear error replies
// Full logging: received, matched, replied, error
'use strict';

var store  = require('./store.js');
var router = require('./router.js');
var { getProvidersStatus } = require('./providerFallback.js');

// ── Safe text — strip Markdown chars that break Telegram's parser ─────────────
// IDs, titles, and dynamic content must be sanitized before embedding in messages
function safe(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[*_`\[\]()~>#+=|{}.!\\]/g, function(c) { return '\\' + c; });
}

// ── Status emoji ──────────────────────────────────────────────────────────────
var SE = {
  pending:          '\u23F3',  // ⏳
  in_progress:      '\uD83D\uDD04', // 🔄
  waiting_approval: '\uD83D\uDC41\uFE0F', // 👁️
  done:             '\u2705',  // ✅
  failed:           '\u274C',  // ❌
  cancelled:        '\uD83D\uDEAB', // 🚫
  assigned:         '\uD83D\uDCE5', // 📥
};
function se(status) { return SE[status] || '\u2022'; }

// ── Log helpers ───────────────────────────────────────────────────────────────
function logCmd(cmd) { console.log('[taskbus] received:', cmd); }
function logMatch(handler) { console.log('[taskbus] matched:', handler); }
function logReply(chatId, len) { console.log('[taskbus] replied to', chatId, '— chars:', len); }
function logErr(handler, err) { console.log('[taskbus] ERROR in', handler, '—', err && err.message || String(err)); }

// ── Safe send — no parse_mode, guaranteed delivery ───────────────────────────
// sendFn from bot.js uses Markdown which can fail on special chars in IDs.
// We pass messages as plain text from taskbus to avoid 400 errors.
async function safeSend(chatId, text, sendFn) {
  var plain = String(text)
    .replace(/\*([^*]+)\*/g, '$1')   // remove *bold*
    .replace(/_([^_]+)_/g, '$1')     // remove _italic_
    .replace(/`([^`]+)`/g, '$1')     // remove `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // remove [links]
  try {
    var result = await sendFn(chatId, plain);
    logReply(chatId, plain.length);
    return result;
  } catch(e) {
    logErr('safeSend', e);
    throw e;
  }
}

// ── /help ─────────────────────────────────────────────────────────────────────
async function handleHelp(chatId, sendFn) {
  logMatch('/taskhelp');
  var msg = [
    'ACC Task Bus Commands',
    '',
    '/tasks          - List recent tasks',
    '/taskstats      - Task counts by status',
    '/agents         - Agent + provider status',
    '/approvals      - Pending approvals',
    '/latesttask     - Newest task',
    '/latestresult   - Newest completed result',
    '/task_<id>      - Task detail by short ID',
    '/result_<id>    - Result detail by short ID',
    '/taskbus_approve_<id>  - Approve a task',
    '/taskbus_reject_<id>   - Reject a task',
    '',
    'Create tasks:',
    'task: <instruction>',
    'tell claude: <instruction>',
    'tell gemini: <instruction>',
  ].join('\n');
  await safeSend(chatId, msg, sendFn);
}

// ── /tasks ────────────────────────────────────────────────────────────────────
async function handleTasks(chatId, sendFn) {
  logMatch('/tasks');
  var tasks = store.getTasks().slice(0, 10);
  if (!tasks.length) {
    await safeSend(chatId, 'No tasks found yet.\n\nCreate one with: task: your instruction', sendFn);
    return;
  }
  var stats = store.getStats();
  var lines = ['Recent Tasks (' + stats.total_tasks + ' total, ' + stats.pending_approvals + ' pending approval)', ''];
  tasks.forEach(function(t) {
    lines.push(se(t.status) + ' ' + t.title.slice(0, 50));
    lines.push('   ID: ' + t.id.slice(0, 8) + ' | ' + t.assigned_agent + ' | ' + t.priority);
    lines.push('');
  });
  lines.push('Use /task_<id> for full detail');
  await safeSend(chatId, lines.join('\n'), sendFn);
}

// ── /taskstats ────────────────────────────────────────────────────────────────
async function handleTaskStats(chatId, sendFn) {
  logMatch('/taskstats');
  var s = store.getStats();
  var lines = [
    'Task Bus Stats',
    '',
    'Total tasks: ' + s.total_tasks,
    'Pending approvals: ' + s.pending_approvals,
    'Results stored: ' + s.total_results,
    'Agents registered: ' + s.agents,
    '',
    'By status:',
  ];
  if (s.by_status) {
    Object.keys(s.by_status).forEach(function(k) {
      lines.push('  ' + se(k) + ' ' + k + ': ' + s.by_status[k]);
    });
  }
  await safeSend(chatId, lines.join('\n'), sendFn);
}

// ── /latesttask ───────────────────────────────────────────────────────────────
async function handleLatestTask(chatId, sendFn) {
  logMatch('/latesttask');
  var tasks = store.getTasks();
  if (!tasks.length) {
    await safeSend(chatId, 'No latest task yet. Create one with: task: your instruction', sendFn);
    return;
  }
  await safeSend(chatId, formatTaskDetail(tasks[0]), sendFn);
}

// ── /latestresult ─────────────────────────────────────────────────────────────
async function handleLatestResult(chatId, sendFn) {
  logMatch('/latestresult');
  var tasks = store.getTasks();
  var allResults = [];
  for (var i = 0; i < Math.min(tasks.length, 30); i++) {
    var r = store.getLatestResult(tasks[i].id);
    if (r) allResults.push(r);
  }
  if (!allResults.length) {
    await safeSend(chatId, 'No latest result yet. Task results appear here after execution.', sendFn);
    return;
  }
  allResults.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  await safeSend(chatId, formatResultDetail(allResults[0]), sendFn);
}

// ── /task_<id> ────────────────────────────────────────────────────────────────
async function handleTaskDetail(chatId, shortId, sendFn) {
  logMatch('/task_' + shortId);
  var tasks = store.getTasks();
  var task  = tasks.find(function(t) {
    return t.id === shortId || t.id.startsWith(shortId) || t.id.slice(0,8) === shortId;
  });
  if (!task) {
    await safeSend(chatId, 'Task not found: ' + shortId + '\n\nUse /tasks to see valid IDs.', sendFn);
    return;
  }
  await safeSend(chatId, formatTaskDetail(task), sendFn);
}

// ── /result_<id> ──────────────────────────────────────────────────────────────
async function handleResultDetail(chatId, shortId, sendFn) {
  logMatch('/result_' + shortId);
  var tasks = store.getTasks();
  var task  = tasks.find(function(t) {
    return t.id === shortId || t.id.startsWith(shortId) || t.id.slice(0,8) === shortId;
  });
  if (!task) {
    await safeSend(chatId, 'Result not found: ' + shortId + '\n\nUse /tasks to see valid task IDs.', sendFn);
    return;
  }
  var result = store.getLatestResult(task.id);
  if (!result) {
    await safeSend(chatId, 'No result yet for task ' + shortId + '\nStatus: ' + task.status + '\n\nRe-route with: POST /api/taskbus/task/' + task.id.slice(0,8) + '/route', sendFn);
    return;
  }
  await safeSend(chatId, formatResultDetail(result), sendFn);
}

// ── /agents ───────────────────────────────────────────────────────────────────
async function handleAgents(chatId, sendFn) {
  logMatch('/agents');
  var ps = await getProvidersStatus().catch(function(e) { logErr('getProvidersStatus', e); return {}; });

  var lines = [
    'ACC Agents & Provider Chain',
    '',
    'Execution chain (auto-fallback):',
  ];

  var dsStatus = ps.deepseek ? ps.deepseek.status : 'unknown';
  lines.push((dsStatus === 'key_set' ? '[KEY SET]' : '[NO KEY]') + ' DeepSeek — primary (low cost)');
  lines.push('   ' + (ps.deepseek ? ps.deepseek.note : 'unknown'));

  var olStatus = ps.ollama ? ps.ollama.status : 'unknown';
  lines.push((olStatus === 'ready' ? '[READY]' : '[OFFLINE]') + ' Ollama — local free fallback');
  lines.push('   ' + (ps.ollama ? ps.ollama.note : 'unknown'));
  if (ps.ollama && ps.ollama.install_cmd) lines.push('   Run: ' + ps.ollama.install_cmd);

  var clStatus = ps.claude ? ps.claude.status : 'unknown';
  lines.push((clStatus === 'key_set' ? '[KEY SET]' : '[NO KEY]') + ' Claude — premium fallback');
  lines.push('   ' + (ps.claude ? ps.claude.note : 'unknown'));

  lines.push('[ALWAYS ON] Smart Stub — zero cost, not real AI');
  lines.push('');
  lines.push('Team agents (manual):');
  ['chatgpt','gemini','notebooklm','clickup'].forEach(function(id) {
    var a = store.AGENTS[id];
    if (a) lines.push('  ' + a.name + ' — ' + a.role);
  });
  lines.push('');
  lines.push('Chain order: deepseek > ollama > claude > smart_stub');

  await safeSend(chatId, lines.join('\n'), sendFn);
}

// ── /approvals ────────────────────────────────────────────────────────────────
async function handleApprovals(chatId, sendFn) {
  logMatch('/approvals');
  var pending = store.getPendingApprovals();
  if (!pending.length) {
    await safeSend(chatId, 'No pending approvals.', sendFn);
    return;
  }
  var lines = ['Pending Approvals: ' + pending.length, ''];
  pending.forEach(function(a) {
    var task = store.getTask(a.task_id);
    lines.push('Task: ' + (task ? task.title.slice(0,50) : 'Unknown'));
    lines.push('Action: ' + a.action);
    lines.push('ID: ' + a.id.slice(0,8));
    lines.push('Approve: /taskbus_approve_' + a.id.slice(0,8));
    lines.push('Reject:  /taskbus_reject_'  + a.id.slice(0,8));
    lines.push('');
  });
  await safeSend(chatId, lines.join('\n'), sendFn);
}

// ── /taskbus_approve_ / reject_ ───────────────────────────────────────────────
async function handleApprovalAction(chatId, text, sendFn) {
  var isApprove = text.startsWith('/taskbus_approve_');
  var shortId   = text.replace('/taskbus_approve_', '').replace('/taskbus_reject_', '').trim();
  logMatch(isApprove ? '/taskbus_approve_' + shortId : '/taskbus_reject_' + shortId);
  var all      = store.getPendingApprovals();
  var approval = all.find(function(a) { return a.id.startsWith(shortId); });
  if (!approval) {
    await safeSend(chatId, 'Approval not found: ' + shortId + '\n\nCheck /approvals for valid IDs.', sendFn);
    return;
  }
  store.resolveApproval(approval.id, isApprove ? 'approved' : 'rejected', 'Shayan', '');
  var task = store.getTask(approval.task_id);
  await safeSend(chatId,
    (isApprove ? 'Approved!' : 'Rejected!') + '\n' +
    'Task: ' + (task ? task.title.slice(0,50) : approval.task_id) + '\n' +
    'Status: ' + (isApprove ? 'done' : 'failed'),
    sendFn
  );
}

// ── Unknown command ───────────────────────────────────────────────────────────
async function replyUnknown(chatId, text, sendFn) {
  logMatch('unknown: ' + text);
  await safeSend(chatId,
    'Unknown command: ' + text + '\n\nUse /taskhelp to see valid Task Bus commands.\nOr /help for all bot commands.',
    sendFn
  );
}

// ── Formatters (plain text, no Markdown) ─────────────────────────────────────
function formatTaskDetail(t) {
  var lines = [
    'Task Detail',
    '',
    se(t.status) + ' ' + t.title,
    '',
    'ID:       ' + t.id,
    'Status:   ' + t.status,
    'Agent:    ' + t.assigned_agent,
    'Mode:     ' + t.automation_mode,
    'Priority: ' + t.priority,
    'Approval: ' + (t.approval_required ? 'Required' : 'Not required'),
    'Created:  ' + new Date(t.created_at).toLocaleString(),
    'Updated:  ' + new Date(t.updated_at).toLocaleString(),
  ];
  if (t.feature_ref) lines.push('Feature:  ' + t.feature_ref);
  if (t.instruction) {
    lines.push('');
    lines.push('Instruction:');
    lines.push(t.instruction.slice(0, 300) + (t.instruction.length > 300 ? '...' : ''));
  }
  lines.push('');
  lines.push('See result: /result_' + t.id.slice(0,8));
  return lines.join('\n');
}

function formatResultDetail(r) {
  var lines = [
    'Task Result',
    '',
    'Task ID:   ' + (r.task_id || '?').slice(0,8),
    'Provider:  ' + (r.provider_used || 'unknown'),
    'Real AI:   ' + (r.is_real_ai_result === true ? 'Yes' : r.is_real_ai_result === false ? 'No (stub)' : 'Unknown'),
    'Cost tier: ' + (r.cost_tier || 'unknown'),
    'Chain:     ' + (r.provider_chain_attempted && r.provider_chain_attempted.length
                      ? r.provider_chain_attempted.join(' > ') : 'unknown'),
    'Time:      ' + new Date(r.timestamp).toLocaleString(),
    '',
    'Summary:',
    (r.summary || 'No summary'),
  ];
  if (r.risks && r.risks.length) {
    lines.push('');
    lines.push('Risks:');
    r.risks.forEach(function(risk) { lines.push('  - ' + risk); });
  }
  if (r.next_request) {
    lines.push('');
    lines.push('Next request:');
    lines.push(r.next_request);
  }
  if (r.output) {
    lines.push('');
    lines.push('Output:');
    lines.push(r.output.slice(0, 700) + (r.output.length > 700 ? '\n...(truncated)' : ''));
  }
  return lines.join('\n');
}

// ── MASTER HANDLER ────────────────────────────────────────────────────────────
async function handleTaskBusCommand(chatId, userId, text, sendFn, user) {
  logCmd(text);

  // Wrap every handler in try/catch — never go silent
  async function run(label, fn) {
    try {
      await fn();
    } catch(e) {
      logErr(label, e);
      try {
        await safeSend(chatId, 'Task Bus command failed: ' + (e.message || 'unknown error'), sendFn);
      } catch(e2) {
        console.log('[taskbus] CRITICAL — could not send error reply:', e2.message);
      }
    }
  }

  // ── Exact matches ──────────────────────────────────────────────────────────
  if (text === '/tasks')        { await run('/tasks',       function(){ return handleTasks(chatId, sendFn); });       return true; }
  if (text === '/taskstats')    { await run('/taskstats',   function(){ return handleTaskStats(chatId, sendFn); });   return true; }
  if (text === '/agents')       { await run('/agents',      function(){ return handleAgents(chatId, sendFn); });      return true; }
  if (text === '/approvals')    { await run('/approvals',   function(){ return handleApprovals(chatId, sendFn); });   return true; }
  if (text === '/latesttask')   { await run('/latesttask',  function(){ return handleLatestTask(chatId, sendFn); });  return true; }
  if (text === '/latestresult') { await run('/latestresult',function(){ return handleLatestResult(chatId, sendFn); });return true; }
  if (text === '/briefing' || text === '/brief') {
    await run('/briefing', async function() {
      var scheduler = require('../telegram/features/scheduler.js');
      await safeSend(chatId, '⏳ Generating your briefing...', sendFn);
      try {
        await scheduler.sendBriefingForUser(chatId, 'morning');
      } catch(e) {
        await safeSend(chatId, '❌ ' + e.message, sendFn);
      }
    });
    return true;
  }

  // ── goal: prefix — parallel workflow engine ────────────────────────────────
  if (text.toLowerCase().startsWith('goal:') || text.toLowerCase().startsWith('/goal ')) {
    await run('goal', async function() {
      var goal = text.replace(/^goal:\s*/i,'').replace(/^\/goal\s+/i,'').trim();
      if (!goal) { await safeSend(chatId, 'Please provide a goal.\n\nExample: goal: create a YouTube video about finance', sendFn); return; }
      var { executeGoal } = require('../orchestrator/parallelWorkflow.js');
      var result = await executeGoal(goal, chatId, async function(update) {
        try { await safeSend(chatId, update, sendFn); } catch(e) {}
      });
      if (result.success) {
        var out = result.merged_output || '';
        await safeSend(chatId, 'RESULT\n\n' + out.slice(0, 3500) + (out.length > 3500 ? '\n\n...(truncated - ' + result.branch_count + ' agents ran)' : ''), sendFn);
        if (result.requires_approval) await safeSend(chatId, 'This result requires your approval before publishing/deploying.\n\nCheck /approvals', sendFn);
      } else {
        await safeSend(chatId, 'Goal execution failed: ' + result.error, sendFn);
      }
    });
    return true;
  }
  if (text === '/notebook') {
    await run('/notebook', async function() {
      var notebookExport = require('../services/notebookExport.js');
      var content = notebookExport.buildExportPacket();
      if (!content) {
        await safeSend(chatId, 'No completed tasks in last 7 days to export.\n\nRun some tasks first: task: your instruction', sendFn);
        return;
      }
      var fpath = notebookExport.saveExport(content);
      var count = (content.match(/^## \d+\./mg) || []).length;
      var lines = [
        'NotebookLM Export Ready',
        'Tasks: ' + count + ' | File saved to data/notebook-exports/',
        '',
        'How to use:',
        '1. Open NotebookLM (notebooklm.google.com)',
        '2. Click Add Source',
        '3. Paste the content below or upload the file',
        '',
        '--- CONTENT PREVIEW ---',
        content.slice(0, 2500),
        content.length > 2500 ? '\n...[' + (content.length - 2500) + ' chars truncated — full file on disk]' : '',
      ];
      await safeSend(chatId, lines.join('\n'), sendFn);
    });
    return true;
  }
  // Handle callback_data style (from inline buttons) as well as slash commands
  if (text.startsWith('taskbus_approve_') || text.startsWith('taskbus_reject_')) {
    var cbText = '/' + text; // add slash prefix
    await run('approval-cb', function(){ return handleApprovalAction(chatId, cbText, sendFn); });
    return true;
  }
  if (text.startsWith('/taskbus_approve_') || text.startsWith('/taskbus_reject_')) {
    await run('approval', function(){ return handleApprovalAction(chatId, text, sendFn); });
    return true;
  }

  // ── /task_<id> ────────────────────────────────────────────────────────────
  if (text.startsWith('/task_') || text.startsWith('/taskdetails_')) {
    var id1 = text.replace('/taskdetails_','').replace('/task_','').trim();
    if (id1.length >= 4) {
      await run('/task_' + id1, function(){ return handleTaskDetail(chatId, id1, sendFn); });
    } else {
      await run('unknown', function(){ return replyUnknown(chatId, text, sendFn); });
    }
    return true;
  }

  // ── /result_<id> ──────────────────────────────────────────────────────────
  if (text.startsWith('/result_')) {
    var id2 = text.replace('/result_','').trim();
    if (id2.length >= 4) {
      await run('/result_' + id2, function(){ return handleResultDetail(chatId, id2, sendFn); });
    } else {
      await run('unknown', function(){ return replyUnknown(chatId, text, sendFn); });
    }
    return true;
  }

  // ── Catch all /task* and /taskbus* typos ──────────────────────────────────
  if (text.startsWith('/task') || text.startsWith('/taskbus')) {
    await run('unknown', function(){ return replyUnknown(chatId, text, sendFn); });
    return true;
  }

  return false; // not a taskbus command
}

// ── Extract deliverable text from routeTask + stored result ───────────────────
function extractRouteOutput(routeResult, taskId) {
  var output = routeResult && (routeResult.output || routeResult.summary);
  var prov   = routeResult && routeResult.provider_used;
  var isReal = routeResult && (routeResult.is_real_ai_result || routeResult.is_real_ai);
  if (!output || String(output).length < 4) {
    var latest = store.getLatestResult(taskId);
    if (latest) {
      output = latest.output || latest.summary || output;
      prov   = latest.provider_used || prov;
      isReal = typeof latest.is_real_ai_result === 'boolean' ? latest.is_real_ai_result : isReal;
    }
  }
  if ((!output || String(output).length < 4) && routeResult && routeResult.summary) {
    output = routeResult.summary;
  }
  return { text: String(output || '').trim(), prov: prov, isReal: !!isReal };
}

// ── createTaskFromMessage ─────────────────────────────────────────────────────
async function createTaskFromMessage(userId, text, assigned_agent, sendFn, chatId) {
  var isTaskCreate = /^((task|create task|new task|tell claude|tell gemini|tell chatgpt|tell notebooklm|tell openhands|openhands:|code:)|tavily:|research:|tell tavily|image:|generate:|img:|qwen:|alibaba:)/i.test(text);
  if (!isTaskCreate) return false;

  var instruction = text.replace(/^(task|create task|new task|tell claude|tell gemini|tell chatgpt|tell notebooklm|tell openhands|openhands:|code:):?\s*/i, '').trim();
  if (!instruction.length) {
    await safeSend(chatId, 'Please provide an instruction after task:\n\nExample: task: summarize the latest system status', sendFn);
    return true;
  }

  var agent = 'claude';
  if (/^tell gemini/i.test(text))        agent = 'gemini';
  if (/^tell chatgpt/i.test(text))       agent = 'chatgpt';
  if (/^tell notebooklm/i.test(text))    agent = 'notebooklm';
  if (/^tell openhands/i.test(text))     agent = 'openhands';
  if (/^openhands:/i.test(text))         agent = 'openhands';
  if (/^code:/i.test(text))              agent = 'openhands';
  if (/^tell crewai/i.test(text))        agent = 'crewai';
  if (/^crewai:/i.test(text))            agent = 'crewai';
  if (/^crew:/i.test(text))              agent = 'crewai';
  if (/^composio:/i.test(text))          agent = 'composio';
  if (/^tavily:/i.test(text))            agent = 'tavily';
  if (/^image:/i.test(text))             agent = 'imagegen';
  if (/^generate:/i.test(text))          agent = 'imagegen';
  if (/^img:/i.test(text))               agent = 'imagegen';
  if (/^qwen:/i.test(text))              agent = 'alibaba';
  if (/^alibaba:/i.test(text))           agent = 'alibaba';
  if (/^research:/i.test(text))          agent = 'tavily';
  if (/^tell tavily/i.test(text))        agent = 'tavily';
  if (/^tell composio/i.test(text))      agent = 'composio';
  if (/^aider:/i.test(text))             agent = 'aider';
  if (/^tell aider/i.test(text))         agent = 'aider';
  if (/^devika:/i.test(text))            agent = 'devika';
  if (/^tell devika/i.test(text))        agent = 'devika';
  if (/^alphonso:/i.test(text))          agent = 'alphonso';
  if (/^tell alphonso/i.test(text))      agent = 'alphonso';
  if (/^local:/i.test(text))             agent = 'alphonso'; // shortcut for local Ollama

  var task = store.createTask({
    title:             instruction.slice(0, 80),
    instruction:       instruction,
    assigned_agent:    agent,
    automation_mode:   (agent === 'claude' || agent === 'openhands' || agent === 'crewai') ? 'semi_auto' : 'manual',
    approval_required: false,
    created_by:        'telegram:' + userId,
    priority:          'normal',
  });

  console.log('[taskbus] createTask:', task.id.slice(0,8), '|', task.title.slice(0,50));

  // Acknowledge
  await safeSend(chatId, 'Working on it...\n\n' + task.title.slice(0, 60), sendFn);
  await safeSend(chatId, 'Task queued!\nID: ' + task.id.slice(0,8) + '\nAgent: ' + agent, sendFn);

  // Execute and return result
  if (task.automation_mode !== 'manual') {
    try {
      console.log('[taskbus] routing task:', task.id.slice(0,8));
      var routeResult = await router.routeTask(task.id);

      if (routeResult && routeResult.status === 'rate_limited') {
        await safeSend(chatId, routeResult.message || 'Rate limit hit. Try again in a few minutes.', sendFn);
        return true;
      }
      if (routeResult && routeResult.status === 'waiting_approval') {
        await safeSend(chatId, 'Approval required! Check: /approvals', sendFn);
        return true;
      }

      var delivered = extractRouteOutput(routeResult, task.id);
      if (delivered.text.length > 3) {
        var label = delivered.isReal ? 'Done! (' + (delivered.prov || 'AI') + ')\n\n' : 'Done!\n\n';
        await safeSend(chatId, label + delivered.text.slice(0, 3500), sendFn);
      } else if (routeResult && routeResult.status === 'assigned') {
        await safeSend(chatId, 'Task queued for ' + agent + '. Pick up: /task_' + task.id.slice(0, 8), sendFn);
      } else {
        await safeSend(chatId, 'Task stored. Check: /task_' + task.id.slice(0, 8), sendFn);
      }
    } catch(e) {
      console.log('[taskbus] execution error:', e.message);
      await safeSend(chatId, 'Execution error: ' + e.message + '\n\nTask stored: ' + task.id.slice(0,8), sendFn);
    }
  }

  return true;
}

module.exports = { handleTaskBusCommand, createTaskFromMessage };
