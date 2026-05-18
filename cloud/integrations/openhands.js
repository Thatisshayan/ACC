'use strict';
// cloud/integrations/openhands.js
// OpenHands AI coding agent connector
// Docs: https://github.com/OpenHands/OpenHands
// Deploy on Railway: railway.com/deploy/openhands-ai-agent

var axios = require('axios');

var BASE = process.env.OPENHANDS_URL || '';
var KEY  = process.env.OPENHANDS_API_KEY || '';

if (!BASE) console.warn('[openhands] OPENHANDS_URL not set — connector disabled');

function enabled() { return !!BASE; }

function headers() {
  var h = { 'Content-Type': 'application/json' };
  if (KEY) h['Authorization'] = 'Bearer ' + KEY;
  // Basic auth support (Railway OpenHands template uses basic auth)
  var user = process.env.OPENHANDS_USER || 'shayan';
  var pass = process.env.OPENHANDS_API_KEY || KEY;
  if (user && pass) h['Authorization'] = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
  return h;
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'Set OPENHANDS_URL to enable' };
  try {
    var r = await axios.get(BASE + '/api/health', { headers: headers(), timeout: 5000 });
    return { status: 'connected', url: BASE, data: r.data };
  } catch(e) {
    return { status: 'error', url: BASE, error: e.message };
  }
}

async function createConversation(repoPath, task) {
  try {
    var r = await axios.post(BASE + '/api/conversations', {
      repository: repoPath || '',
      initial_message: task,
      max_iterations: 30,
    }, { headers: headers(), timeout: 15000 });
    return { success: true, conversation_id: r.data.conversation_id || r.data.id, status: r.data.status };
  } catch(e) { return { success: false, error: e.message }; }
}

async function getConversation(id) {
  try {
    var r = await axios.get(BASE + '/api/conversations/' + id, { headers: headers(), timeout: 10000 });
    return { success: true, status: r.data.status, messages: r.data.messages, result: r.data.result, pr_url: r.data.pr_url };
  } catch(e) { return { success: false, error: e.message }; }
}

async function waitForResult(id, timeoutMs) {
  var timeout = timeoutMs || 300000; // 5 min default
  var start   = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(function(r){ setTimeout(r, 5000); });
    var conv = await getConversation(id);
    if (!conv.success) return { success: false, error: conv.error };
    if (conv.status === 'done' || conv.status === 'completed' || conv.status === 'finished') {
      return { success: true, output: conv.result || '', pr_url: conv.pr_url || '', messages: conv.messages };
    }
    if (conv.status === 'failed' || conv.status === 'error') {
      return { success: false, error: 'OpenHands task failed', messages: conv.messages };
    }
    // still running — keep polling
  }
  return { success: false, error: 'OpenHands timeout after ' + (timeout/1000) + 's' };
}

async function runTask(repoPath, task, timeoutMs) {
  if (!enabled()) return { success: false, error: 'OPENHANDS_URL not set' };
  var conv = await createConversation(repoPath, task);
  if (!conv.success) return conv;
  return waitForResult(conv.conversation_id, timeoutMs);
}

// ACC Task Bus adapter — called by router.js
async function sendTaskFromACC(accTask) {
  var repo = (accTask.meta && accTask.meta.repo) || process.env.ACC_REPO_PATH || 'C:\\Users\\Shaya\\agent-command-center';
  var task = accTask.instruction || accTask.title;
  return runTask(repo, task, 300000);
}

module.exports = { enabled, checkHealth, createConversation, getConversation, waitForResult, runTask, sendTaskFromACC };
