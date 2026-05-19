'use strict';
// cloud/integrations/composio.js
// Composio.dev — unified integration platform (250+ tools via one API)
// Replaces individual connectors for Gmail, Slack, GitHub, Linear, Notion, HubSpot etc.

var axios = require('axios');
var BASE  = 'https://backend.composio.dev/api/v1';
var KEY   = process.env.COMPOSIO_API_KEY || '';

if (!KEY) console.warn('[composio] COMPOSIO_API_KEY not set — get it at app.composio.dev');

function enabled() { return !!KEY; }

function h() { return { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }; }

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'Set COMPOSIO_API_KEY. Get it at app.composio.dev' };
  try {
    var r = await axios.get(BASE + '/apps', { headers: h(), timeout: 8000 });
    var apps = (r.data.items || r.data || []).length;
    return { status: 'connected', apps_available: apps };
  } catch(e) { return { status: 'error', error: e.response ? e.response.status : e.message }; }
}

async function listApps() {
  if (!enabled()) return { success: false, error: 'COMPOSIO_API_KEY not set' };
  try {
    var r = await axios.get(BASE + '/apps', { headers: h(), timeout: 8000 });
    return { success: true, apps: r.data.items || r.data || [] };
  } catch(e) { return { success: false, error: e.message }; }
}

async function getActions(appName) {
  if (!enabled()) return { success: false, error: 'COMPOSIO_API_KEY not set' };
  try {
    var r = await axios.get(BASE + '/actions?app=' + appName, { headers: h(), timeout: 8000 });
    return { success: true, actions: r.data.items || r.data || [] };
  } catch(e) { return { success: false, error: e.message }; }
}

async function executeAction(appName, actionName, params, entityId) {
  if (!enabled()) return { success: false, error: 'COMPOSIO_API_KEY not set' };
  try {
    var r = await axios.post(BASE + '/actions/execute', {
      action: appName + '_' + actionName,
      input: params || {},
      entityId: entityId || 'default',
    }, { headers: h(), timeout: 30000 });
    return { success: true, data: r.data };
  } catch(e) { return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message }; }
}

// ACC Task Bus adapter — parses instruction like "send gmail email to john@test.com subject Hello body Hi"
async function sendTaskFromACC(accTask) {
  if (!enabled()) return { success: false, error: 'COMPOSIO_API_KEY not set. Get at app.composio.dev' };
  var instruction = accTask.instruction || accTask.title || '';
  var meta = accTask.meta || {};

  // If meta has explicit action, use it
  if (meta.composio_app && meta.composio_action) {
    return executeAction(meta.composio_app, meta.composio_action, meta.params || {}, meta.entityId);
  }

  // Otherwise return the instruction for manual routing
  return {
    success: false,
    error: 'Composio needs explicit app+action. Set meta.composio_app and meta.composio_action in task.',
    hint: 'Example: task with meta: { composio_app: "gmail", composio_action: "send_email", params: { to: "x@y.com", subject: "Hi", body: "Hello" } }',
    instruction: instruction,
  };
}

module.exports = { enabled, checkHealth, listApps, getActions, executeAction, sendTaskFromACC };
