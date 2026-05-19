'use strict';
// cloud/integrations/devika.js
// Devika AI coding agent — local web server interface
// Setup: git clone https://github.com/stitionai/devika && pip install -r requirements.txt && python devika.py
var axios = require('axios');
var BASE  = process.env.DEVIKA_URL || 'http://localhost:1337';

if (!process.env.DEVIKA_URL) console.warn('[devika] DEVIKA_URL not set — defaults to http://localhost:1337. Start Devika first.');

function enabled() { return !!process.env.DEVIKA_URL; }

async function checkHealth() {
  try {
    var r = await axios.get(BASE + '/api/data/models-available', { timeout: 5000 });
    return { status: 'connected', url: BASE, models: r.data };
  } catch(e) {
    return { status: 'error', url: BASE, note: 'Start Devika: python devika.py', error: e.message.slice(0, 80) };
  }
}

async function createProject(name, instruction) {
  try {
    var r = await axios.post(BASE + '/api/create-project', { project_name: name, message: instruction }, { timeout: 15000 });
    return { success: true, project: name, data: r.data };
  } catch(e) { return { success: false, error: e.message }; }
}

async function getAgentState(projectName) {
  try {
    var r = await axios.get(BASE + '/api/get-agent-state/' + encodeURIComponent(projectName), { timeout: 8000 });
    return { success: true, state: r.data };
  } catch(e) { return { success: false, error: e.message }; }
}

async function waitForCompletion(projectName, timeoutMs) {
  var timeout = timeoutMs || 180000;
  var start   = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(function(r){ setTimeout(r, 5000); });
    var s = await getAgentState(projectName);
    if (!s.success) continue;
    var state = s.state || {};
    if (state.completed || state.status === 'done' || state.status === 'completed') {
      return { success: true, output: state.response || state.message || JSON.stringify(state), state: state };
    }
    if (state.status === 'error' || state.status === 'failed') {
      return { success: false, error: state.error || 'Devika task failed' };
    }
  }
  return { success: false, error: 'Devika timeout after ' + (timeout/1000) + 's' };
}

async function sendTaskFromACC(accTask) {
  if (!enabled()) return { success: false, error: 'Set DEVIKA_URL in .env and start Devika' };
  var name = 'acc-' + (accTask.id || Date.now()).toString().slice(0, 8);
  var created = await createProject(name, accTask.instruction || accTask.title);
  if (!created.success) return created;
  return waitForCompletion(name);
}

module.exports = { enabled, checkHealth, createProject, getAgentState, waitForCompletion, sendTaskFromACC };
