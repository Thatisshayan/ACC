'use strict';
// cloud/integrations/runnable.js — Runnable agent connector
var axios = require('axios');
var KEY  = process.env.RUNNABLE_API_KEY || '';
var BASE = process.env.RUNNABLE_BASE_URL || 'https://api.runnable.ai';
if (!KEY) console.warn('[runnable] RUNNABLE_API_KEY not set');
function enabled() { return !!KEY; }
async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'Set RUNNABLE_API_KEY' };
  try {
    var r = await axios.get(BASE + '/health', { headers: { Authorization: 'Bearer ' + KEY }, timeout: 8000 });
    return { status: 'connected', data: r.data };
  } catch(e) { return { status: 'error', error: e.message }; }
}
async function createTask(instruction) {
  if (!enabled()) return { success: false, error: 'RUNNABLE_API_KEY not set' };
  try {
    var r = await axios.post(BASE + '/tasks', { instruction }, {
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, timeout: 30000
    });
    return { success: true, taskId: r.data.id, status: r.data.status };
  } catch(e) { return { success: false, error: e.message }; }
}
async function getResult(taskId) {
  try {
    var r = await axios.get(BASE + '/tasks/' + taskId, { headers: { Authorization: 'Bearer ' + KEY }, timeout: 10000 });
    return { success: true, status: r.data.status, output: r.data.output };
  } catch(e) { return { success: false, error: e.message }; }
}
async function sendTaskFromACC(accTask) {
  if (!enabled()) return { success: false, error: 'RUNNABLE_API_KEY not set', output: 'Runnable not configured — set RUNNABLE_API_KEY in .env' };
  var t = await createTask(accTask.instruction || accTask.title);
  if (!t.success) return t;
  var start = Date.now();
  while (Date.now() - start < 60000) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    var result = await getResult(t.taskId);
    if (result.status === 'completed' || result.status === 'done') return { success: true, output: result.output, summary: 'Runnable task completed' };
    if (result.status === 'failed') return { success: false, error: 'Runnable task failed', output: result.output };
  }
  return { success: false, error: 'Runnable task timeout after 60s' };
}
module.exports = { enabled, checkHealth, createTask, getResult, sendTaskFromACC };
