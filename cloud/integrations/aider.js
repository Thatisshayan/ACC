'use strict';
// cloud/integrations/aider.js
// Aider AI coding agent — spawns CLI subprocess with DeepSeek as LLM
// Install: pip install aider-install && aider-install
var cp   = require('child_process');
var path = require('path');

var ENABLED  = process.env.AIDER_ENABLED === 'true';
var REPO     = process.env.ACC_REPO_PATH || 'C:\\Users\\Shaya\\agent-command-center';
var DS_KEY   = process.env.DEEPSEEK_API_KEY || '';

if (!ENABLED) console.warn('[aider] Set AIDER_ENABLED=true to enable. Install: pip install aider-install');

function enabled() { return ENABLED && !!DS_KEY; }

async function checkHealth() {
  if (!ENABLED) return { status: 'disabled', note: 'Set AIDER_ENABLED=true in .env' };
  return new Promise(function(resolve) {
    cp.exec('aider --version', { timeout: 8000 }, function(err, stdout) {
      if (err) return resolve({ status: 'error', note: 'Run: pip install aider-install && aider-install', error: err.message.slice(0,80) });
      resolve({ status: 'connected', version: stdout.trim() });
    });
  });
}

async function runTask(repoPath, instruction, model) {
  if (!enabled()) return { success: false, error: 'Aider not enabled or DEEPSEEK_API_KEY missing' };
  return new Promise(function(resolve) {
    var env = Object.assign({}, process.env, {
      OPENAI_API_KEY:    DS_KEY,
      OPENAI_API_BASE:   'https://api.deepseek.com/v1',
      AIDER_NO_AUTO_COMMITS: '0',
    });
    var args = [
      '--model', model || 'deepseek/deepseek-chat',
      '--yes',
      '--no-pretty',
      '--no-stream',
      '--message', instruction,
    ];
    console.log('[aider] Running in:', repoPath);
    var proc = cp.spawn('aider', args, { cwd: repoPath || REPO, env: env, timeout: 120000 });
    var out = ''; var err = '';
    proc.stdout.on('data', function(d){ out += d.toString(); });
    proc.stderr.on('data', function(d){ err += d.toString(); });
    proc.on('close', function(code) {
      if (code === 0 || out.length > 50) {
        var filesMatch = out.match(/\b(\S+\.(js|ts|py|json|md))\b/g) || [];
        resolve({ success: true, output: out.slice(0, 3000), files_changed: [...new Set(filesMatch)].slice(0, 10) });
      } else {
        resolve({ success: false, error: (err || out).slice(0, 200) });
      }
    });
    proc.on('error', function(e) { resolve({ success: false, error: e.message }); });
  });
}

async function sendTaskFromACC(accTask) {
  var repo = (accTask.meta && accTask.meta.repo) || REPO;
  return runTask(repo, accTask.instruction || accTask.title);
}

module.exports = { enabled, checkHealth, runTask, sendTaskFromACC };
