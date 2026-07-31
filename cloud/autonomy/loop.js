'use strict';
// cloud/autonomy/loop.js — ACC autonomous loop engine
// ACC self-schedules recurring goals, monitors progress, and takes follow-up actions
// without waiting for a human prompt each time

const memory  = require('../memory/store.js');
const { log } = require('../utils/logger.js');
const { v4: uuid } = require('uuid');

function getStore()  { return require('../taskbus/store.js'); }
function getRouter() { return require('../taskbus/router.js'); }

const SCOPE = 'autonomy:loops';
var _timers = {};   // loopId → setTimeout handle
var _running = false;

// ── Loop definition ───────────────────────────────────────────────────────────
// {
//   id, name, goal, intervalMs,
//   agent: 'claude'|'deepseek'|...,
//   enabled, lastRunAt, nextRunAt,
//   maxConsecutiveFailures (default 3)
//   onSuccess: 'notify'|'task'|'silent'
// }

function createLoop(spec) {
  if (!spec.name || !spec.goal) throw new Error('name and goal required');
  var loop = {
    id:                     spec.id || uuid(),
    name:                   String(spec.name),
    goal:                   String(spec.goal),
    intervalMs:             spec.intervalMs || 3600000,  // default: 1 hour
    agent:                  spec.agent || 'claude',
    enabled:                spec.enabled !== false,
    onSuccess:              spec.onSuccess || 'notify',
    maxConsecutiveFailures: spec.maxConsecutiveFailures || 3,
    consecutiveFailures:    0,
    created_at:             new Date().toISOString(),
    lastRunAt:              null,
    nextRunAt:              new Date(Date.now() + (spec.initialDelayMs || 0)).toISOString(),
    lastStatus:             null,
    lastResult:             null,
  };
  memory.remember(SCOPE, loop.id, loop, { source: 'autonomy', importance: 9 });
  memory.logEvent(SCOPE, 'loop_created', { loopId: loop.id, name: loop.name }, 'autonomy');
  log('[autonomy] Loop created:', loop.name, '| interval:', Math.round(loop.intervalMs / 60000) + 'min');
  if (loop.enabled && _running) _scheduleLoop(loop);
  return loop;
}

function getLoop(loopId) { return memory.recall(SCOPE, loopId); }

function getAllLoops() {
  return memory.recallAll(SCOPE, { limit: 100 }).map(function(r) { return r.value; }).filter(Boolean);
}

function updateLoop(loopId, patch) {
  var loop = getLoop(loopId);
  if (!loop) return null;
  Object.assign(loop, patch);
  memory.remember(SCOPE, loopId, loop, { source: 'autonomy', importance: 9 });
  return loop;
}

function deleteLoop(loopId) {
  if (_timers[loopId]) { clearTimeout(_timers[loopId]); delete _timers[loopId]; }
  return memory.forget(SCOPE, loopId);
}

function enableLoop(loopId) {
  var loop = updateLoop(loopId, { enabled: true, consecutiveFailures: 0 });
  if (loop && _running) _scheduleLoop(loop);
  return loop;
}

function disableLoop(loopId) {
  if (_timers[loopId]) { clearTimeout(_timers[loopId]); delete _timers[loopId]; }
  return updateLoop(loopId, { enabled: false });
}

// ── Scheduling ────────────────────────────────────────────────────────────────

function _scheduleLoop(loop) {
  if (_timers[loop.id]) clearTimeout(_timers[loop.id]);
  var now = Date.now();
  var next = loop.nextRunAt ? new Date(loop.nextRunAt).getTime() : now;
  var delay = Math.max(0, next - now);
  _timers[loop.id] = setTimeout(function() { _runLoop(loop.id); }, delay);
}

async function _runLoop(loopId) {
  var loop = getLoop(loopId);
  if (!loop || !loop.enabled) return;

  log('[autonomy] Running loop:', loop.name);
  memory.logEvent(SCOPE, 'loop_started', { loopId, name: loop.name }, 'autonomy');

  // Build context from memory
  var contextMems = memory.recallAll('global', { limit: 10, minImportance: 7 });
  var contextStr  = contextMems.length
    ? '\n\nRelevant context:\n' + contextMems.map(function(m) { return '- ' + m.key + ': ' + JSON.stringify(m.value); }).join('\n')
    : '';

  var store  = getStore();
  var router = getRouter();

  var task = store.createTask({
    title:             '[Auto] ' + loop.name,
    instruction:       loop.goal + contextStr,
    assigned_agent:    loop.agent,
    automation_mode:   'auto',
    approval_required: false,
    created_by:        'autonomy:' + loopId,
    priority:          'normal',
    meta:              { loopId, autonomous: true },
  });

  try {
    var result = await router.routeTask(task.id);
    var output = (result && (result.output || result.summary || result.result)) || null;
    var patch = {
      lastRunAt:          new Date().toISOString(),
      lastStatus:         'success',
      lastResult:         output ? String(output).slice(0, 500) : null,
      consecutiveFailures: 0,
      nextRunAt:          new Date(Date.now() + loop.intervalMs).toISOString(),
    };
    updateLoop(loopId, patch);
    memory.logEvent(SCOPE, 'loop_success', { loopId, name: loop.name, taskId: task.id }, 'autonomy');
    memory.remember('autonomy:results:' + loopId, 'latest', { output, taskId: task.id, at: patch.lastRunAt }, { source: 'autonomy', importance: 7 });

    if (loop.onSuccess === 'notify') _notifyTelegram('[Auto] ' + loop.name + '\n\n' + (output || 'Done.'));

  } catch(e) {
    var failures = (loop.consecutiveFailures || 0) + 1;
    log('[autonomy] Loop', loop.name, 'failed:', e.message, '| consecutive:', failures);
    var failPatch = {
      lastRunAt:           new Date().toISOString(),
      lastStatus:          'failed',
      lastResult:          e.message,
      consecutiveFailures: failures,
      nextRunAt:           new Date(Date.now() + loop.intervalMs).toISOString(),
    };
    if (failures >= loop.maxConsecutiveFailures) {
      failPatch.enabled = false;
      log('[autonomy] Loop', loop.name, 'disabled after', failures, 'failures');
      _notifyTelegram('⚠️ [Auto] Loop "' + loop.name + '" disabled after ' + failures + ' failures.\nLast error: ' + e.message);
    }
    updateLoop(loopId, failPatch);
    memory.logEvent(SCOPE, 'loop_failed', { loopId, name: loop.name, error: e.message, failures }, 'autonomy');
  }

  // Re-schedule if still enabled
  var refreshed = getLoop(loopId);
  if (refreshed && refreshed.enabled) _scheduleLoop(refreshed);
}

// ── Telegram notification ─────────────────────────────────────────────────────

function _notifyTelegram(text) {
  try {
    var chatId = process.env.ACC_OWNER_TELEGRAM_CHAT_ID || process.env.SHAYAN_TELEGRAM_CHAT_ID;
    if (!chatId) return;
    var token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    var https = require('https');
    var body  = JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3000), parse_mode: 'Markdown' });
    var req   = https.request({ hostname: 'api.telegram.org', path: '/bot' + token + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
    req.on('error', function(){});
    req.write(body);
    req.end();
  } catch(_) {}
}

// ── Start / stop engine ───────────────────────────────────────────────────────

function start() {
  if (_running) return;
  _running = true;
  var loops = getAllLoops().filter(function(l) { return l.enabled; });
  loops.forEach(_scheduleLoop);
  log('[autonomy] Engine started |', loops.length, 'active loops');
}

function stop() {
  _running = false;
  Object.keys(_timers).forEach(function(id) { clearTimeout(_timers[id]); });
  _timers = {};
  log('[autonomy] Engine stopped');
}

// ── Run once immediately ──────────────────────────────────────────────────────

async function runNow(loopId) {
  return _runLoop(loopId);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function stats() {
  var loops   = getAllLoops();
  var enabled = loops.filter(function(l) { return l.enabled; }).length;
  var recent  = memory.getEvents(SCOPE, { limit: 20 });
  return { total: loops.length, enabled, scheduled: Object.keys(_timers).length, recent_events: recent };
}

// ── Default loop seeds (run once on first boot) ───────────────────────────────

var DEFAULT_LOOPS = [
  {
    id:          'default-daily-summary',
    name:        'Daily task summary',
    goal:        'Summarize all tasks completed today, highlight any failures or items waiting for approval, and report the overall ACC system health. Keep it concise — 5 bullets max.',
    intervalMs:  24 * 60 * 60 * 1000,  // 24 hours
    agent:       'claude',
    onSuccess:   'notify',
    initialDelayMs: 60 * 60 * 1000,    // first run after 1 hour
  },
  {
    id:          'default-email-check',
    name:        'Email monitor check',
    goal:        'Check whether the email monitor is configured and active. If it is, report how many job-related emails have been seen in the last 24 hours. If it is not configured, remind the user to set it up via /settings in Telegram.',
    intervalMs:  5 * 60 * 1000,        // every 5 minutes
    agent:       'claude',
    onSuccess:   'silent',             // email monitor itself sends notifications
    initialDelayMs: 2 * 60 * 1000,
  },
  {
    id:          'default-system-health',
    name:        'System health watchdog',
    goal:        'Check the ACC system health: backend status, active task count, any tasks stuck in waiting_approval for more than 1 hour, and bridge connectivity. Alert if anything is degraded.',
    intervalMs:  30 * 60 * 1000,       // every 30 minutes
    agent:       'claude',
    onSuccess:   'silent',
    initialDelayMs: 5 * 60 * 1000,
  },
];

function seedDefaultLoops() {
  var existing = getAllLoops();
  var existingIds = new Set(existing.map(function(l) { return l.id; }));
  var seeded = 0;
  DEFAULT_LOOPS.forEach(function(spec) {
    if (!existingIds.has(spec.id)) {
      createLoop(spec);
      seeded++;
    }
  });
  if (seeded > 0) log('[autonomy] Seeded', seeded, 'default loops');
}

module.exports = { createLoop, getLoop, getAllLoops, updateLoop, deleteLoop, enableLoop, disableLoop, runNow, start, stop, stats, seedDefaultLoops };
