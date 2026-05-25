// cloud/connectors/airtable.js
// Airtable connector for ACC v2
// Uses: CRM (users), Task tracking, Results storage
// Get token: airtable.com/create/tokens
'use strict';

const axios = require('axios');

const BASE_URL = 'https://api.airtable.com/v0';
const API_KEY  = process.env.AIRTABLE_API_KEY;
const BASE_ID  = process.env.AIRTABLE_BASE_ID;

if (!API_KEY)  console.warn('[airtable] AIRTABLE_API_KEY not set — connector disabled');
if (!BASE_ID)  console.warn('[airtable] AIRTABLE_BASE_ID not set — connector disabled');

function headers() {
  return { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' };
}

function enabled() {
  return !!(API_KEY && BASE_ID);
}

// ── Core CRUD ─────────────────────────────────────────────────────────────────
async function createRecord(table, fields) {
  if (!enabled()) return { success: false, error: 'Airtable not configured' };
  try {
    const r = await axios.post(
      BASE_URL + '/' + BASE_ID + '/' + encodeURIComponent(table),
      { fields },
      { headers: headers(), timeout: 10000 }
    );
    return { success: true, id: r.data.id, fields: r.data.fields };
  } catch(e) {
    return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message };
  }
}

async function updateRecord(table, recordId, fields) {
  if (!enabled()) return { success: false, error: 'Airtable not configured' };
  try {
    const r = await axios.patch(
      BASE_URL + '/' + BASE_ID + '/' + encodeURIComponent(table) + '/' + recordId,
      { fields },
      { headers: headers(), timeout: 10000 }
    );
    return { success: true, id: r.data.id, fields: r.data.fields };
  } catch(e) {
    return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message };
  }
}

async function findRecords(table, filterFormula, maxRecords) {
  if (!enabled()) return { success: false, error: 'Airtable not configured' };
  try {
    const params = { maxRecords: maxRecords || 100 };
    if (filterFormula) params.filterByFormula = filterFormula;
    const r = await axios.get(
      BASE_URL + '/' + BASE_ID + '/' + encodeURIComponent(table),
      { headers: headers(), params, timeout: 10000 }
    );
    return { success: true, records: r.data.records };
  } catch(e) {
    return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message };
  }
}

// ── ACC-specific sync functions ───────────────────────────────────────────────

// Sync a completed Task Bus task to Airtable
async function syncTask(task, result) {
  return createRecord('Tasks', {
    'Task ID':       task.id,
    'Title':         task.title,
    'Status':        task.status,
    'Agent':         task.assigned_agent,
    'Provider':      (result && result.provider_used) || 'unknown',
    'Real AI':       !!(result && result.is_real_ai_result),
    'Cost Tier':     (result && result.cost_tier) || 'unknown',
    'Summary':       (result && result.summary && result.summary.slice(0, 900)) || '',
    'Created At':    task.created_at,
    'Completed At':  task.updated_at,
  });
}

// Register or update a user in Airtable CRM
async function syncUser(user) {
  // Check if exists first
  const existing = await findRecords('Users', "{ACC User ID} = '" + user.id + "'", 1);
  if (existing.success && existing.records && existing.records.length > 0) {
    return updateRecord('Users', existing.records[0].id, {
      'Last Active':     new Date().toISOString(),
      'Bot Usage Count': (existing.records[0].fields['Bot Usage Count'] || 0) + 1,
    });
  }
  return createRecord('Users', {
    'ACC User ID':     user.id,
    'Name':            user.name || 'Unknown',
    'Language':        user.language || 'en',
    'Status':          'active',
    'Signup Date':     new Date().toISOString(),
    'Last Active':     new Date().toISOString(),
    'Bot Usage Count': 1,
  });
}

// Log an approval event
async function syncApproval(approval, task) {
  return createRecord('Approvals', {
    'Approval ID':  approval.id,
    'Task ID':      approval.task_id,
    'Task Title':   (task && task.title) || 'Unknown',
    'Action':       approval.action,
    'Status':       approval.status || 'pending',
    'Requested At': approval.created_at || new Date().toISOString(),
    'Resolved By':  approval.resolved_by || '',
    'Resolved At':  approval.resolved_at || '',
  });
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'AIRTABLE_API_KEY or AIRTABLE_BASE_ID missing' };
  try {
    await axios.get(BASE_URL + '/' + BASE_ID, { headers: headers(), timeout: 5000 });
    return { status: 'connected', base_id: BASE_ID };
  } catch(e) {
    if (e.response && e.response.status === 404) {
      return { status: 'error', error: 'invalid base id or base not accessible' };
    }
    if (e.response && (e.response.status === 401 || e.response.status === 403)) {
      return { status: 'error', error: 'airtable api key unauthorized or missing access' };
    }
    return { status: 'error', error: e.response ? e.response.status : e.message };
  }
}

module.exports = { createRecord, updateRecord, findRecords, syncTask, syncUser, syncApproval, checkHealth, enabled };
