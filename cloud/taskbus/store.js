// cloud/taskbus/store.js
// ACC v2 Agent Task Bus — disk-persisted, local-first, modular
// Zero external DB needed. All data in data/taskbus/*.json
'use strict';

const fs   = require('fs');
const path = require('path');
const uuid = require('uuid').v4;

const DATA_DIR = path.join(__dirname, '../../data/taskbus');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Agents registry ───────────────────────────────────────────────────────────
const AGENTS = {
  chatgpt: {
    id: 'chatgpt', name: 'ChatGPT', provider: 'openai',
    role: 'Orchestrator / Chief of Staff',
    automation_mode: 'manual',  // creates tasks, reviews results
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
  human: {
    id: 'human', name: 'Shayan', provider: 'human',
    role: 'Founder / Final Decision Maker',
    automation_mode: 'manual',
    enabled: true,
    capabilities: ['approval', 'priority', 'go_live', 'strategy'],
  },
};

// ── File helpers ──────────────────────────────────────────────────────────────
function file(name) { return path.join(DATA_DIR, name + '.json'); }

function load(name) {
  const fp = file(name);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(_) { return []; }
}

function save(name, data) {
  fs.writeFileSync(file(name), JSON.stringify(data, null, 2), 'utf8');
}

function append(name, item) {
  const list = load(name);
  list.unshift(item);
  if (list.length > 1000) list.splice(1000);
  save(name, list);
  return item;
}

// ── TASKS ─────────────────────────────────────────────────────────────────────
function createTask(opts) {
  const task = {
    id:               uuid(),
    title:            opts.title || 'Untitled Task',
    instruction:      opts.instruction || '',
    assigned_agent:   opts.assigned_agent || 'claude',
    status:           'pending',      // pending | in_progress | waiting_approval | approved_pending_route | done | failed | cancelled
    priority:         opts.priority || 'normal', // urgent | high | normal | low
    required_output:  opts.required_output || '',
    approval_required: opts.approval_required !== false,
    automation_mode:  opts.automation_mode || 'sandbox',
    feature_ref:      opts.feature_ref || null,   // e.g. "#7 — Job Tracker"
    created_by:       opts.created_by || 'chatgpt',
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  };
  return append('tasks', task);
}

function getTasks(filter) {
  const tasks = load('tasks');
  if (!filter) return tasks;
  return tasks.filter(function(t) {
    if (filter.status        && t.status        !== filter.status)        return false;
    if (filter.assigned_agent && t.assigned_agent !== filter.assigned_agent) return false;
    if (filter.priority      && t.priority      !== filter.priority)      return false;
    return true;
  });
}

function getTask(id) { return load('tasks').find(function(t) { return t.id === id; }) || null; }

function updateTask(id, patch) {
  const tasks = load('tasks');
  const idx   = tasks.findIndex(function(t) { return t.id === id; });
  if (idx === -1) return null;
  tasks[idx] = Object.assign({}, tasks[idx], patch, { updated_at: new Date().toISOString() });
  save('tasks', tasks);
  return tasks[idx];
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────
function addMessage(taskId, fromAgent, toAgent, content) {
  const msg = {
    id:         uuid(),
    task_id:    taskId,
    from_agent: fromAgent,
    to_agent:   toAgent,
    content:    String(content),
    timestamp:  new Date().toISOString(),
  };
  return append('messages', msg);
}

function getMessages(taskId) {
  return load('messages').filter(function(m) { return m.task_id === taskId; });
}

// ── RESULTS ───────────────────────────────────────────────────────────────────
function addResult(opts) {
  const result = {
    id:            uuid(),
    task_id:       opts.task_id,
    agent:         opts.agent || 'claude',

    // Provider metadata (full chain tracking)
    provider_used:            opts.provider_used            || opts.adapter_used || null,
    provider_chain_attempted: opts.provider_chain_attempted || [],
    fallback_reason:          opts.fallback_reason          || null,
    execution_mode:           opts.execution_mode           || null,
    cost_tier:                opts.cost_tier                || null,
    is_real_ai_result:        typeof opts.is_real_ai_result === 'boolean' ? opts.is_real_ai_result : null,

    // Task result
    summary:       opts.summary       || '',
    output:        opts.output        || '',
    files_changed: opts.files_changed || [],
    risks:         opts.risks         || [],
    next_request:  opts.next_request  || '',

    timestamp: new Date().toISOString(),
  };
  // Auto-mark task status (router now handles this, but keep as safety net)
  if (opts.auto_update_task === true) {
    const task = getTask(opts.task_id);
    if (task && task.status === 'in_progress') {
      updateTask(opts.task_id, { status: task.approval_required ? 'waiting_approval' : 'done' });
    }
  }
  return append('results', result);
}

function getResults(taskId) {
  return load('results').filter(function(r) { return r.task_id === taskId; });
}

function getAllResults(limit) {
  const results = load('results');
  return typeof limit === 'number' ? results.slice(0, limit) : results;
}

function getLatestResult(taskId) {
  return getResults(taskId)[0] || null;
}

// ── APPROVALS ─────────────────────────────────────────────────────────────────
function createApproval(taskId, action) {
  const approval = {
    id:          uuid(),
    task_id:     taskId,
    action:      action || 'review',
    status:      'pending',  // pending | approved | rejected
    approved_by: null,
    notes:       '',
    timestamp:   new Date().toISOString(),
  };
  return append('approvals', approval);
}

function resolveApproval(id, decision, approvedBy, notes) {
  const approvals = load('approvals');
  const idx       = approvals.findIndex(function(a) { return a.id === id; });
  if (idx === -1) return null;
  approvals[idx].status      = decision; // 'approved' | 'rejected'
  approvals[idx].approved_by = approvedBy || 'Shayan';
  approvals[idx].notes       = notes || '';
  approvals[idx].resolved_at = new Date().toISOString();
  save('approvals', approvals);
  // Approval only records human permission. Execution/result REDACTED happens later.
  const task = getTask(approvals[idx].task_id);
  if (task) updateTask(task.id, { status: decision === 'approved' ? 'approved_pending_route' : 'failed' });
  return approvals[idx];
}

function getPendingApprovals() {
  return load('approvals').filter(function(a) { return a.status === 'pending'; });
}

function getApproval(id) { return load('approvals').find(function(a) { return a.id === id; }) || null; }

function hasApprovedApproval(taskId, action) {
  return load('approvals').some(function(a) {
    return a.task_id === taskId
      && a.status === 'approved'
      && (!action || a.action === action);
  });
}

// ── Stats / Dashboard ─────────────────────────────────────────────────────────
function getStats() {
  const tasks     = load('tasks');
  const approvals = load('approvals');
  const results   = load('results');
  const byStatus = {};
  tasks.forEach(function(t) { byStatus[t.status] = (byStatus[t.status]||0) + 1; });
  return {
    total_tasks:       tasks.length,
    by_status:         byStatus,
    pending_approvals: approvals.filter(function(a){return a.status==='pending';}).length,
    total_results:     results.length,
    agents:            Object.keys(AGENTS).length,
  };
}

module.exports = {
  AGENTS,
  createTask, getTasks, getTask, updateTask,
  addMessage, getMessages,
  addResult,  getResults, getAllResults, getLatestResult,
  createApproval, resolveApproval, getPendingApprovals, getApproval, hasApprovedApproval,
  getStats,
};
