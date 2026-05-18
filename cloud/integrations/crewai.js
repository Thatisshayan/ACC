'use strict';
// cloud/integrations/crewai.js
// CrewAI multi-agent framework bridge for ACC v2
// Spawns Python subprocess running CrewAI with DeepSeek

var cp   = require('child_process');
var fs   = require('fs');
var path = require('path');
var os   = require('os');

var ENABLED = process.env.CREWAI_ENABLED === 'true';
var PYTHON  = process.env.PYTHON_PATH || 'python';
var AGENT   = path.join(__dirname, 'crewai_agent.py');

if (!ENABLED) console.warn('[crewai] CREWAI_ENABLED not set — connector disabled. Set CREWAI_ENABLED=true to enable.');

function enabled() { return ENABLED; }

async function checkHealth() {
  if (!ENABLED) return { status: 'disabled', note: 'Set CREWAI_ENABLED=true in .env' };
  return new Promise(function(resolve) {
    cp.exec(PYTHON + ' -c "import crewai; print(crewai.__version__)"', { timeout: 10000 }, function(err, stdout) {
      if (err) return resolve({ status: 'error', note: 'Run: pip install crewai crewai-tools python-dotenv', error: err.message.slice(0,100) });
      resolve({ status: 'connected', version: stdout.trim() });
    });
  });
}

async function runTask(task, timeoutMs) {
  if (!ENABLED) return { success: false, error: 'CREWAI_ENABLED not set' };
  return new Promise(function(resolve) {
    // Write task to temp file
    var tmpFile = path.join(os.tmpdir(), 'acc_crewai_' + Date.now() + '.json');
    try { fs.writeFileSync(tmpFile, JSON.stringify(task), 'utf8'); }
    catch(e) { return resolve({ success: false, error: 'Failed to write task file: ' + e.message }); }

    var env = Object.assign({}, process.env);
    var cmd = PYTHON + ' "' + AGENT + '" "' + tmpFile + '"';
    console.log('[crewai] Spawning:', cmd.slice(0, 80));

    cp.exec(cmd, { timeout: timeoutMs || 120000, env: env }, function(err, stdout, stderr) {
      try { fs.unlinkSync(tmpFile); } catch(e) {}
      if (err && !stdout) {
        console.log('[crewai] Error:', (stderr||err.message).slice(0,200));
        return resolve({ success: false, error: (stderr || err.message).slice(0, 200) });
      }
      try {
        var lines = stdout.trim().split('\n');
        var last  = lines[lines.length - 1];
        var result = JSON.parse(last);
        console.log('[crewai] Done. Success:', result.success);
        resolve(result);
      } catch(e) {
        resolve({ success: true, output: stdout.trim(), summary: 'CrewAI completed' });
      }
    });
  });
}

async function sendTaskFromACC(accTask) {
  var task = {
    id:          accTask.id,
    title:       accTask.title,
    instruction: accTask.instruction,
    feature_ref: accTask.feature_ref || '',
  };
  return runTask(task);
}

module.exports = { enabled, checkHealth, runTask, sendTaskFromACC };
