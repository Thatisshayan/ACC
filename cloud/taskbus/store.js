// cloud/taskbus/store.js
// ACC v2 Agent Task Bus — SQLite-backed, local-first, atomic writes
// Replaces the previous JSON-file implementation with better-sqlite3.
// WAL mode enabled for concurrent read safety.
// Public API is identical to the previous version; callers need no changes.
'use strict';

const fs      = require('fs');
const path    = require('path');
const uuid    = require('uuid').v4;
const Database = require('better-sqlite3');
const persistence = require('./persistence.js');

// ── DB location ───────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../../data/taskbus');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'taskbus.sqlite3');

// ── Open + configure DB ───────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');   // safe concurrent reads
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL'); // fsync on checkpoints only; WAL handles safety

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL DEFAULT '',
    instruction      TEXT NOT NULL DEFAULT '',
    assigned_agent   TEXT NOT NULL DEFAULT 'claude',
    status           TEXT NOT NULL DEFAULT 'pending',
    priority         TEXT NOT NULL DEFAULT 'normal',
    required_output  TEXT NOT NULL DEFAULT '',
    approval_required INTEGER NOT NULL DEFAULT 1,
    automation_mode  TEXT NOT NULL DEFAULT 'sandbox',
    feature_ref      TEXT,
    created_by       TEXT NOT NULL DEFAULT 'chatgpt',
    request_id       TEXT,
    meta             TEXT,
    provider_used    TEXT,
    error            TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent);
  CREATE INDEX IF NOT EXISTS idx_tasks_created_at     ON tasks(created_at DESC);

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    from_agent  TEXT NOT NULL DEFAULT '',
    to_agent    TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    timestamp   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);

  CREATE TABLE IF NOT EXISTS results (
    id                       TEXT PRIMARY KEY,
    task_id                  TEXT NOT NULL,
    agent                    TEXT NOT NULL DEFAULT 'claude',
    provider_used            TEXT,
    provider_chain_attempted TEXT NOT NULL DEFAULT '[]',
    fallback_reason          TEXT,
    execution_mode           TEXT,
    cost_tier                TEXT,
    is_real_ai_result        INTEGER,
    summary                  TEXT NOT NULL DEFAULT '',
    output                   TEXT NOT NULL DEFAULT '',
    files_changed            TEXT NOT NULL DEFAULT '[]',
    risks                    TEXT NOT NULL DEFAULT '[]',
    next_request             TEXT NOT NULL DEFAULT '',
    request_id               TEXT,
    receipt                  TEXT,
    failure_class            TEXT,
    timestamp                TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_results_task_id ON results(task_id);

  CREATE TABLE IF NOT EXISTS approvals (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    action      TEXT NOT NULL DEFAULT 'review',
    status      TEXT NOT NULL DEFAULT 'pending',
    approved_by TEXT,
    notes       TEXT NOT NULL DEFAULT '',
    timestamp   TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_approvals_task_id ON approvals(task_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_status  ON approvals(status);
`);

// ── Migration: import existing JSON files on first run ────────────────────────
// Only runs once; skipped if the DB already has data.
(function migrateFromJson() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM tasks').get();
  if (count && count.n > 0) return; // already migrated

  var migrated = { tasks: 0, messages: 0, results: 0, approvals: 0 };

  function readJson(name) {
    var fp = path.join(DATA_DIR, name + '.json');
    if (!fs.existsSync(fp)) return [];
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return []; }
  }

  var insertTask = db.prepare(`
    INSERT OR IGNORE INTO tasks
      (id, title, instruction, assigned_agent, status, priority, required_output,
       approval_required, automation_mode, feature_ref, created_by, request_id,
       meta, provider_used, error, created_at, updated_at)
    VALUES
      (@id, @title, @instruction, @assigned_agent, @status, @priority, @required_output,
       @approval_required, @automation_mode, @feature_ref, @created_by, @request_id,
       @meta, @provider_used, @error, @created_at, @updated_at)
  `);

  var insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (id, task_id, from_agent, to_agent, content, timestamp)
    VALUES (@id, @task_id, @from_agent, @to_agent, @content, @timestamp)
  `);

  var insertResult = db.prepare(`
    INSERT OR IGNORE INTO results
      (id, task_id, agent, provider_used, provider_chain_attempted, fallback_reason,
       execution_mode, cost_tier, is_real_ai_result, summary, output, files_changed,
       risks, next_request, request_id, receipt, failure_class, timestamp)
    VALUES
      (@id, @task_id, @agent, @provider_used, @provider_chain_attempted, @fallback_reason,
       @execution_mode, @cost_tier, @is_real_ai_result, @summary, @output, @files_changed,
       @risks, @next_request, @request_id, @receipt, @failure_class, @timestamp)
  `);

  var insertApproval = db.prepare(`
    INSERT OR IGNORE INTO approvals
      (id, task_id, action, status, approved_by, notes, timestamp, resolved_at)
    VALUES
      (@id, @task_id, @action, @status, @approved_by, @notes, @timestamp, @resolved_at)
  `);

  var now = new Date().toISOString();
  var migrateAll = db.transaction(function() {
    for (var t of readJson('tasks')) {
      try {
        insertTask.run({
          id: t.id, title: t.title || '', instruction: t.instruction || '',
          assigned_agent: t.assigned_agent || 'claude', status: t.status || 'pending',
          priority: t.priority || 'normal', required_output: t.required_output || '',
          approval_required: t.approval_required ? 1 : 0,
          automation_mode: t.automation_mode || 'sandbox',
          feature_ref: t.feature_ref || null, created_by: t.created_by || 'chatgpt',
          request_id: t.request_id || null,
          meta: t.meta ? JSON.stringify(t.meta) : null,
          provider_used: t.provider_used || null,
          error: t.error || null,
          created_at: t.created_at || now, updated_at: t.updated_at || now,
        });
        migrated.tasks++;
      } catch (_) {}
    }

    for (var m of readJson('messages')) {
      try {
        insertMessage.run({
          id: m.id, task_id: m.task_id, from_agent: m.from_agent || '',
          to_agent: m.to_agent || '', content: String(m.content || ''),
          timestamp: m.timestamp || now,
        });
        migrated.messages++;
      } catch (_) {}
    }

    for (var res of readJson('results')) {
      try {
        insertResult.run({
          id: res.id, task_id: res.task_id, agent: res.agent || 'claude',
          provider_used: res.provider_used || null,
          provider_chain_attempted: JSON.stringify(res.provider_chain_attempted || []),
          fallback_reason: res.fallback_reason || null,
          execution_mode: res.execution_mode || null,
          cost_tier: res.cost_tier || null,
          is_real_ai_result: typeof res.is_real_ai_result === 'boolean' ? (res.is_real_ai_result ? 1 : 0) : null,
          summary: res.summary || '', output: res.output || '',
          files_changed: JSON.stringify(res.files_changed || []),
          risks: JSON.stringify(res.risks || []),
          next_request: res.next_request || '',
          request_id: res.request_id || null, receipt: res.receipt || null,
          failure_class: res.failure_class || null,
          timestamp: res.timestamp || now,
        });
        migrated.results++;
      } catch (_) {}
    }

    for (var a of readJson('approvals')) {
      try {
        insertApproval.run({
          id: a.id, task_id: a.task_id, action: a.action || 'review',
          status: a.status || 'pending', approved_by: a.approved_by || null,
          notes: a.notes || '', timestamp: a.timestamp || now,
          resolved_at: a.resolved_at || null,
        });
        migrated.approvals++;
      } catch (_) {}
    }
  });

  migrateAll();

  if (migrated.tasks > 0 || migrated.messages > 0 || migrated.results > 0 || migrated.approvals > 0) {
    console.log('[store] Migrated from JSON:',
      migrated.tasks + ' tasks,', migrated.messages + ' messages,',
      migrated.results + ' results,', migrated.approvals + ' approvals');
  }
})();

// ── Restart recovery: any task stuck in_progress when we boot → failed ────────
// Prevents tasks from hanging forever after a crash or clean restart.
(function recoverInProgressTasks() {
  var now = new Date().toISOString();
  var info = db.prepare(
    "UPDATE tasks SET status = 'failed', error = 'process_restart', updated_at = ? WHERE status = 'in_progress'"
  ).run(now);
  if (info.changes > 0) {
    console.log('[store] Restart recovery: marked', info.changes, 'in_progress task(s) as failed (reason: process_restart)');
  }
})();

// ── Stale-task watchdog ───────────────────────────────────────────────────────
// Any task still in_progress after STALE_TASK_TIMEOUT_MS is considered hung
// (provider call timed out but we never transitioned the status). Mark failed.
var STALE_TASK_TIMEOUT_MS = parseInt(process.env.STALE_TASK_TIMEOUT_MS || String(10 * 60 * 1000));
var WATCHDOG_INTERVAL_MS  = parseInt(process.env.WATCHDOG_INTERVAL_MS  || String(5  * 60 * 1000));

var _staleStmt = db.prepare(
  "UPDATE tasks SET status = 'failed', error = 'watchdog_timeout', updated_at = ? " +
  "WHERE status = 'in_progress' AND updated_at < ?"
);

function runWatchdog() {
  var now    = new Date();
  var cutoff = new Date(now.getTime() - STALE_TASK_TIMEOUT_MS).toISOString();
  var info   = _staleStmt.run(now.toISOString(), cutoff);
  if (info.changes > 0) {
    console.log('[store] Watchdog: marked', info.changes, 'stale in_progress task(s) as failed (reason: watchdog_timeout)');
  }
}

var _watchdogTimer = setInterval(runWatchdog, WATCHDOG_INTERVAL_MS);
// Allow the process to exit even if the interval is still active.
if (_watchdogTimer.unref) _watchdogTimer.unref();

// ── Agents registry (static, unchanged) ──────────────────────────────────────
const AGENTS = {
  chatgpt: {
    id: 'chatgpt', name: 'ChatGPT', provider: 'openai',
    role: 'Orchestrator / Chief of Staff',
    automation_mode: 'manual',
    enabled: true,
    capabilities: ['task_creation', 'result_review', 'strategy', 'coordination'],
  },
  claude: {
    id: 'claude', name: 'Claude', provider: 'anthropic',
    role: 'Backend / Automation / Stabilization',
    automation_mode: 'semi_auto',
    enabled: true,
    capabilities: ['code', 'architecture', 'debugging', 'automation', 'writing'],
  },
  gemini: {
    id: 'gemini', name: 'Gemini', provider: 'google',
    role: 'UI/UX / Dashboard Design',
    automation_mode: 'manual',
    enabled: true,
    capabilities: ['ui_design', 'ux', 'dashboard', 'visual_language'],
  },
  notebooklm: {
    id: 'notebooklm', name: 'NotebookLM', provider: 'google',
    role: 'Source Validation / Strategy',
    automation_mode: 'manual',
    enabled: true,
    capabilities: ['validation', 'source_grounding', 'strategy', 'qa'],
  },
  clickup: {
    id: 'clickup', name: 'ClickUp AI', provider: 'clickup',
    role: 'PMO / Task Tracking',
    automation_mode: 'sandbox',
    enabled: true,
    capabilities: ['task_management', 'sprints', 'reporting', 'dependencies'],
  },
  lead_collector: {
    id: 'lead_collector', name: 'Lead Collector', provider: 'acc',
    role: 'Lead intake, qualification, and outreach prep',
    automation_mode: 'semi_auto',
    enabled: true,
    capabilities: ['lead_intake', 'lead_qualification', 'outreach_prep', 'crm_sync'],
  },
  human: {
    id: 'human', name: 'Shayan', provider: 'human',
    role: 'Founder / Final Decision Maker',
    automation_mode: 'manual',
    enabled: true,
    capabilities: ['approval', 'priority', 'go_live', 'strategy'],
  },
};

// ── Row → object helpers ──────────────────────────────────────────────────────
function rowToTask(row) {
  if (!row) return null;
  return {
    id:               row.id,
    title:            row.title,
    instruction:      row.instruction,
    assigned_agent:   row.assigned_agent,
    status:           row.status,
    priority:         row.priority,
    required_output:  row.required_output,
    approval_required: row.approval_required === 1,
    automation_mode:  row.automation_mode,
    feature_ref:      row.feature_ref || null,
    created_by:       row.created_by,
    request_id:       row.request_id || null,
    meta:             row.meta ? safeParseJson(row.meta, null) : null,
    provider_used:    row.provider_used || null,
    error:            row.error || null,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
  };
}

function rowToResult(row) {
  if (!row) return null;
  return {
    id:                       row.id,
    task_id:                  row.task_id,
    agent:                    row.agent,
    provider_used:            row.provider_used || null,
    provider_chain_attempted: safeParseJson(row.provider_chain_attempted, []),
    fallback_reason:          row.fallback_reason || null,
    execution_mode:           row.execution_mode || null,
    cost_tier:                row.cost_tier || null,
    is_real_ai_result:        row.is_real_ai_result === null ? null : row.is_real_ai_result === 1,
    summary:                  row.summary,
    output:                   row.output,
    files_changed:            safeParseJson(row.files_changed, []),
    risks:                    safeParseJson(row.risks, []),
    next_request:             row.next_request,
    request_id:               row.request_id || null,
    receipt:                  row.receipt || null,
    failure_class:            row.failure_class || null,
    timestamp:                row.timestamp,
  };
}

function rowToApproval(row) {
  if (!row) return null;
  return {
    id:          row.id,
    task_id:     row.task_id,
    action:      row.action,
    status:      row.status,
    approved_by: row.approved_by || null,
    notes:       row.notes,
    timestamp:   row.timestamp,
    resolved_at: row.resolved_at || null,
  };
}

function safeParseJson(text, fallback) {
  try { return JSON.parse(text); } catch (_) { return fallback; }
}

// ── Prepared statements ───────────────────────────────────────────────────────
const stmts = {
  insertTask: db.prepare(`
    INSERT INTO tasks
      (id, title, instruction, assigned_agent, status, priority, required_output,
       approval_required, automation_mode, feature_ref, created_by, request_id,
       meta, provider_used, error, created_at, updated_at)
    VALUES
      (@id, @title, @instruction, @assigned_agent, @status, @priority, @required_output,
       @approval_required, @automation_mode, @feature_ref, @created_by, @request_id,
       @meta, @provider_used, @error, @created_at, @updated_at)
  `),

  getTaskById: db.prepare('SELECT * FROM tasks WHERE id = ?'),

  // Returns the 1000 most recent tasks
  getAllTasks: db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1000'),

  updateTask: db.prepare(`
    UPDATE tasks SET
      title = COALESCE(@title, title),
      instruction = COALESCE(@instruction, instruction),
      assigned_agent = COALESCE(@assigned_agent, assigned_agent),
      status = COALESCE(@status, status),
      priority = COALESCE(@priority, priority),
      required_output = COALESCE(@required_output, required_output),
      approval_required = COALESCE(@approval_required, approval_required),
      automation_mode = COALESCE(@automation_mode, automation_mode),
      feature_ref = COALESCE(@feature_ref, feature_ref),
      provider_used = COALESCE(@provider_used, provider_used),
      error = COALESCE(@error, error),
      meta = COALESCE(@meta, meta),
      updated_at = @updated_at
    WHERE id = @id
  `),

  insertMessage: db.prepare(`
    INSERT INTO messages (id, task_id, from_agent, to_agent, content, timestamp)
    VALUES (@id, @task_id, @from_agent, @to_agent, @content, @timestamp)
  `),

  getMessagesByTask: db.prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY timestamp DESC'),

  insertResult: db.prepare(`
    INSERT INTO results
      (id, task_id, agent, provider_used, provider_chain_attempted, fallback_reason,
       execution_mode, cost_tier, is_real_ai_result, summary, output, files_changed,
       risks, next_request, request_id, receipt, failure_class, timestamp)
    VALUES
      (@id, @task_id, @agent, @provider_used, @provider_chain_attempted, @fallback_reason,
       @execution_mode, @cost_tier, @is_real_ai_result, @summary, @output, @files_changed,
       @risks, @next_request, @request_id, @receipt, @failure_class, @timestamp)
  `),

  getResultsByTask: db.prepare('SELECT * FROM results WHERE task_id = ? ORDER BY timestamp DESC'),

  getAllResults: db.prepare('SELECT * FROM results ORDER BY timestamp DESC LIMIT ?'),

  insertApproval: db.prepare(`
    INSERT INTO approvals (id, task_id, action, status, approved_by, notes, timestamp, resolved_at)
    VALUES (@id, @task_id, @action, @status, @approved_by, @notes, @timestamp, @resolved_at)
  `),

  getApprovalById: db.prepare('SELECT * FROM approvals WHERE id = ?'),

  getPendingApprovals: db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY timestamp DESC"),

  updateApproval: db.prepare(`
    UPDATE approvals SET status = @status, approved_by = @approved_by, notes = @notes, resolved_at = @resolved_at
    WHERE id = @id
  `),

  hasApprovedApproval: db.prepare(`
    SELECT COUNT(*) AS n FROM approvals
    WHERE task_id = @task_id AND status = 'approved' AND (@action IS NULL OR action = @action)
    LIMIT 1
  `),

  countByStatus: db.prepare("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status"),
  countPendingApprovals: db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'"),
  countResults: db.prepare("SELECT COUNT(*) AS n FROM results"),
};

// ── TASKS ─────────────────────────────────────────────────────────────────────
function createTask(opts) {
  var now  = new Date().toISOString();
  var task = {
    id:               uuid(),
    title:            opts.title || 'Untitled Task',
    instruction:      opts.instruction || '',
    assigned_agent:   opts.assigned_agent || 'claude',
    status:           'pending',
    priority:         opts.priority || 'normal',
    required_output:  opts.required_output || '',
    approval_required: opts.approval_required !== false,
    automation_mode:  opts.automation_mode || 'sandbox',
    feature_ref:      opts.feature_ref || null,
    created_by:       opts.created_by || 'chatgpt',
    request_id:       opts.request_id || null,
    meta:             opts.meta ? JSON.stringify(opts.meta) : null,
    provider_used:    null,
    error:            null,
    created_at:       now,
    updated_at:       now,
  };
  stmts.insertTask.run(Object.assign({}, task, {
    approval_required: task.approval_required ? 1 : 0,
  }));
  var created = rowToTask(stmts.getTaskById.get(task.id));
  persistence.syncTaskToCloud(created).catch(function() {});
  _fireTaskUpdateHook(created);
  return created;
}

function getTasks(filter) {
  var rows = stmts.getAllTasks.all();
  var tasks = rows.map(rowToTask);
  if (!filter) return tasks;
  return tasks.filter(function(t) {
    if (filter.status        && t.status        !== filter.status)        return false;
    if (filter.assigned_agent && t.assigned_agent !== filter.assigned_agent) return false;
    if (filter.priority      && t.priority      !== filter.priority)      return false;
    return true;
  });
}

function getTask(id) {
  return rowToTask(stmts.getTaskById.get(id));
}

function updateTask(id, patch) {
  var existing = stmts.getTaskById.get(id);
  if (!existing) return null;

  stmts.updateTask.run({
    id:               id,
    title:            patch.title            !== undefined ? patch.title            : null,
    instruction:      patch.instruction      !== undefined ? patch.instruction      : null,
    assigned_agent:   patch.assigned_agent   !== undefined ? patch.assigned_agent   : null,
    status:           patch.status           !== undefined ? patch.status           : null,
    priority:         patch.priority         !== undefined ? patch.priority         : null,
    required_output:  patch.required_output  !== undefined ? patch.required_output  : null,
    approval_required: patch.approval_required !== undefined ? (patch.approval_required ? 1 : 0) : null,
    automation_mode:  patch.automation_mode  !== undefined ? patch.automation_mode  : null,
    feature_ref:      patch.feature_ref      !== undefined ? patch.feature_ref      : null,
    provider_used:    patch.provider_used    !== undefined ? patch.provider_used    : null,
    error:            patch.error            !== undefined ? patch.error            : null,
    meta:             patch.meta             !== undefined ? (patch.meta ? JSON.stringify(patch.meta) : null) : null,
    updated_at:       new Date().toISOString(),
  });

  var updated = rowToTask(stmts.getTaskById.get(id));
  _fireTaskUpdateHook(updated);
  return updated;
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────
function addMessage(taskId, fromAgent, toAgent, content) {
  var msg = {
    id:         uuid(),
    task_id:    taskId,
    from_agent: String(fromAgent || ''),
    to_agent:   String(toAgent   || ''),
    content:    String(content   || ''),
    timestamp:  new Date().toISOString(),
  };
  stmts.insertMessage.run(msg);
  return msg;
}

function getMessages(taskId) {
  return stmts.getMessagesByTask.all(taskId);
}

// ── RESULTS ───────────────────────────────────────────────────────────────────
function addResult(opts) {
  var now = new Date().toISOString();
  var row = {
    id:                       uuid(),
    task_id:                  opts.task_id,
    agent:                    opts.agent || 'claude',
    provider_used:            opts.provider_used || opts.adapter_used || null,
    provider_chain_attempted: JSON.stringify(opts.provider_chain_attempted || []),
    fallback_reason:          opts.fallback_reason   || null,
    execution_mode:           opts.execution_mode    || null,
    cost_tier:                opts.cost_tier         || null,
    is_real_ai_result:        typeof opts.is_real_ai_result === 'boolean' ? (opts.is_real_ai_result ? 1 : 0) : null,
    summary:                  opts.summary           || '',
    output:                   opts.output            || '',
    files_changed:            JSON.stringify(opts.files_changed || []),
    risks:                    JSON.stringify(opts.risks         || []),
    next_request:             opts.next_request      || '',
    request_id:               opts.request_id        || null,
    receipt:                  opts.receipt ? (typeof opts.receipt === 'string' ? opts.receipt : JSON.stringify(opts.receipt)) : null,
    failure_class:            opts.failure_class     || null,
    timestamp:                now,
  };
  stmts.insertResult.run(row);

  if (opts.auto_update_task === true) {
    var task = getTask(opts.task_id);
    if (task && task.status === 'in_progress') {
      updateTask(opts.task_id, { status: task.approval_required ? 'waiting_approval' : 'done' });
    }
  }

  var result = rowToResult(row);
  persistence.syncResultToCloud(result).catch(function() {});
  return result;
}

function getResults(taskId) {
  return stmts.getResultsByTask.all(taskId).map(rowToResult);
}

function getAllResults(limit) {
  var n = typeof limit === 'number' ? limit : 1000;
  return stmts.getAllResults.all(n).map(rowToResult);
}

function getLatestResult(taskId) {
  return getResults(taskId)[0] || null;
}

// ── APPROVALS ─────────────────────────────────────────────────────────────────
function createApproval(taskId, action, _meta) {
  var approval = {
    id:          uuid(),
    task_id:     taskId,
    action:      action || 'review',
    status:      'pending',
    approved_by: null,
    notes:       '',
    timestamp:   new Date().toISOString(),
    resolved_at: null,
  };
  stmts.insertApproval.run(approval);
  return rowToApproval(stmts.getApprovalById.get(approval.id));
}

function resolveApproval(id, decision, approvedBy, notes) {
  var existing = stmts.getApprovalById.get(id);
  if (!existing) return null;

  var resolvedAt = new Date().toISOString();
  stmts.updateApproval.run({
    id:          id,
    status:      decision,
    approved_by: approvedBy || 'Shayan',
    notes:       notes || '',
    resolved_at: resolvedAt,
  });

  var approval = rowToApproval(stmts.getApprovalById.get(id));
  var task = getTask(approval.task_id);
  if (task) updateTask(task.id, { status: decision === 'approved' ? 'approved_pending_route' : 'failed' });
  return approval;
}

function getPendingApprovals() {
  return stmts.getPendingApprovals.all().map(rowToApproval);
}

function getApproval(id) {
  return rowToApproval(stmts.getApprovalById.get(id));
}

function hasApprovedApproval(taskId, action) {
  var row = stmts.hasApprovedApproval.get({ task_id: taskId, action: action || null });
  return row && row.n > 0;
}

// ── Stats / Dashboard ─────────────────────────────────────────────────────────
function getStats() {
  var statusRows = stmts.countByStatus.all();
  var byStatus   = {};
  statusRows.forEach(function(r) { byStatus[r.status] = r.n; });

  return {
    total_tasks:       statusRows.reduce(function(s, r) { return s + r.n; }, 0),
    by_status:         byStatus,
    pending_approvals: stmts.countPendingApprovals.get().n,
    total_results:     stmts.countResults.get().n,
    agents:            Object.keys(AGENTS).length,
  };
}

// ── Task update hook (for WebSocket push) ─────────────────────────────────────
// Register a callback via setTaskUpdateHook(fn). It is called every time a task
// is updated, with the updated task object. Used by server.js to broadcast to
// connected WebSocket clients without creating a circular dependency.
var _taskUpdateHook = null;

function setTaskUpdateHook(fn) {
  _taskUpdateHook = typeof fn === 'function' ? fn : null;
}

function _fireTaskUpdateHook(task) {
  if (!_taskUpdateHook || !task) return;
  try { _taskUpdateHook(task); } catch (_) {}
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function close() {
  try { db.close(); } catch (_) {}
}
process.on('exit', close);
process.on('SIGINT',  function() { close(); process.exit(0); });
process.on('SIGTERM', function() { close(); process.exit(0); });

module.exports = {
  AGENTS,
  createTask, getTasks, getTask, updateTask,
  addMessage, getMessages,
  addResult,  getResults, getAllResults, getLatestResult,
  createApproval, resolveApproval, getPendingApprovals, getApproval, hasApprovedApproval,
  getStats,
  setTaskUpdateHook,
  // Exposed for testing / diagnostics
  _db: db,
  close,
};
