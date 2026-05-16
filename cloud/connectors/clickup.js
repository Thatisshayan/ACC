// cloud/connectors/clickup.js — full two-way sync connector
// Get key: app.clickup.com/settings/integrations
'use strict';

const axios = require('axios');
const BASE  = 'https://api.clickup.com/api/v2';
const KEY   = process.env.CLICKUP_API_KEY;

if (!KEY) console.warn('[clickup] CLICKUP_API_KEY not set — connector disabled');

function h() { return { Authorization: KEY, 'Content-Type': 'application/json' }; }
function ok() { return !!KEY; }

// ── Core ──────────────────────────────────────────────────────────────────────
async function getTeams() {
  if (!ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
  try {
    const r = await axios.get(BASE + '/team', { headers: h(), timeout: 8000 });
    return { success: true, teams: r.data.teams };
  } catch(e) { return { success: false, error: e.message }; }
}

async function createTask(listId, data) {
  if (!ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
  try {
    const r = await axios.post(BASE + '/list/' + listId + '/task', {
      name:        data.name,
      description: data.description || '',
      priority:    data.priority || 3,
      status:      data.status || 'to do',
      tags:        data.tags || [],
    }, { headers: h(), timeout: 10000 });
    return { success: true, task: r.data };
  } catch(e) { return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message }; }
}

async function updateTask(taskId, data) {
  if (!ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
  try {
    const r = await axios.put(BASE + '/task/' + taskId, data, { headers: h(), timeout: 8000 });
    return { success: true, task: r.data };
  } catch(e) { return { success: false, error: e.message }; }
}

async function getTasks(listId) {
  if (!ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
  try {
    const r = await axios.get(BASE + '/list/' + listId + '/task', { headers: h(), timeout: 8000 });
    return { success: true, tasks: r.data.tasks };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── ACC Task Bus → ClickUp sync ───────────────────────────────────────────────
// Call these from Task Bus router on events
async function onTaskCompleted(task, result, listId) {
  if (!ok() || !listId) return;
  return createTask(listId, {
    name:        '[ACC DONE] ' + task.title.slice(0, 60),
    description: [
      'Task ID: ' + task.id,
      'Provider: ' + ((result && result.provider_used) || 'unknown'),
      'Real AI: ' + (!!(result && result.is_real_ai_result)),
      'Summary: ' + ((result && result.summary) || 'none'),
    ].join('\n'),
    priority: 3,
    tags:     ['acc', 'completed'],
  });
}

async function onTaskFailed(task, listId) {
  if (!ok() || !listId) return;
  return createTask(listId, {
    name:        '[ACC FAILED] ' + task.title.slice(0, 60),
    description: 'Task ID: ' + task.id + '\nError: ' + (task.error || 'unknown'),
    priority:    2,
    tags:        ['acc', 'failed'],
  });
}

async function onApprovalRequired(task, approvalId, listId) {
  if (!ok() || !listId) return;
  return createTask(listId, {
    name:        '[ACC APPROVAL] ' + task.title.slice(0, 50),
    description: 'Approval ID: ' + approvalId + '\nTask: ' + task.id + '\nApprove via Telegram: @OurAccbot',
    priority:    1,
    tags:        ['acc', 'needs-approval'],
  });
}

async function checkHealth() {
  if (!ok()) return { status: 'disabled', note: 'CLICKUP_API_KEY not set. Get from app.clickup.com/settings/integrations' };
  try {
    const r = await getTeams();
    if (r.success) return { status: 'connected', teams: r.teams.length };
    return { status: 'error', error: r.error };
  } catch(e) { return { status: 'error', error: e.message }; }
}

module.exports = { createTask, updateTask, getTasks, getTeams, onTaskCompleted, onTaskFailed, onApprovalRequired, checkHealth, enabled: ok };
