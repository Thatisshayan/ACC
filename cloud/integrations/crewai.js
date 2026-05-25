'use strict';
// cloud/integrations/crewai.js
// CrewAI multi-agent framework bridge for ACC v2
// Spawns Python subprocess running CrewAI with DeepSeek

var cp   = require('child_process');
var fs   = require('fs');
var path = require('path');
var os   = require('os');
var workflowRegistry = require('../workflows/registry.js');
var workflowDispatcher = require('../workflows/dispatcher.js');

var ENABLED = process.env.CREWAI_ENABLED === 'true';
var PYTHON  = process.env.PYTHON_PATH || 'python';
var AGENT   = path.join(__dirname, 'crewai_agent.py');

if (!ENABLED) console.warn('[crewai] CREWAI_ENABLED not set — connector disabled. Set CREWAI_ENABLED=true to enable.');

function enabled() { return ENABLED; }

function safeText(value) {
  return String(value || '').trim();
}

function parseWorkflowJson(stdout) {
  var lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  for (var i = lines.length - 1; i >= 0; i--) {
    var line = lines[i].trim();
    if (!line) continue;
    if ((line.charAt(0) === '{' && line.charAt(line.length - 1) === '}') ||
        (line.charAt(0) === '[' && line.charAt(line.length - 1) === ']')) {
      try {
        return JSON.parse(line);
      } catch (e) {}
    }
  }
  return null;
}

function buildWorkflowEnv(workflow, accTask) {
  var meta = accTask && accTask.meta ? accTask.meta : {};
  var params = meta.workflow_params && typeof meta.workflow_params === 'object' ? meta.workflow_params : {};
  var taskInput = safeText(meta.workflow_input || accTask.instruction || accTask.title);
  var mergedInputs = {
    workflow_key: workflow.key,
    workflow_id: workflow.id,
    workflow_kind: workflow.kind,
    workflow_name: workflow.name,
    workflow_source_path: workflow.source_path,
    workflow_command: workflow.command,
    workflow_user_command: workflow.user_command,
    workflow_input: taskInput,
    task: {
      id: accTask.id,
      title: accTask.title,
      instruction: accTask.instruction,
      feature_ref: accTask.feature_ref || '',
      assigned_agent: accTask.assigned_agent,
    },
    meta: meta,
    search_query: safeText(params.search_query || meta.search_query || taskInput),
    job_query: safeText(params.job_query || meta.job_query || taskInput),
    target_role: safeText(params.target_role || meta.target_role || meta.role || taskInput),
    job_location: safeText(params.job_location || meta.job_location || ''),
    location: safeText(params.location || meta.location || ''),
    resume_file_path: safeText(params.resume_file_path || meta.resume_file_path || process.env.RESUME_FILE_PATH || ''),
    resume_content: safeText(params.resume_content || meta.resume_content || ''),
    clickup_list_id: safeText(params.clickup_list_id || meta.clickup_list_id || process.env.CLICKUP_LIST_ID || ''),
  };

  var env = Object.assign({}, process.env, {
    ACC_WORKFLOW_INPUTS_JSON: JSON.stringify(mergedInputs),
    ACC_WORKFLOW_TRIGGER: taskInput || workflow.name,
    ACC_WORKFLOW_KEY: workflow.key,
    ACC_WORKFLOW_ID: workflow.id,
    ACC_WORKFLOW_KIND: workflow.kind,
    ACC_WORKFLOW_SOURCE_PATH: workflow.source_path,
    ACC_WORKFLOW_COMMAND: workflow.command || '',
    ACC_WORKFLOW_USER_COMMAND: workflow.user_command || '',
  });

  ['RESUME_FILE_PATH', 'TARGET_ROLE', 'JOB_QUERY', 'JOB_LOCATION', 'CLICKUP_LIST_ID', 'SERPER_API_KEY', 'SERPAPI_API_KEY'].forEach(function(name) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  });

  if (mergedInputs.resume_file_path) env.RESUME_FILE_PATH = mergedInputs.resume_file_path;
  if (mergedInputs.target_role) env.TARGET_ROLE = mergedInputs.target_role;
  if (mergedInputs.job_query) env.JOB_QUERY = mergedInputs.job_query;
  if (mergedInputs.job_location) env.JOB_LOCATION = mergedInputs.job_location;
  if (mergedInputs.clickup_list_id) env.CLICKUP_LIST_ID = mergedInputs.clickup_list_id;
  if (mergedInputs.location && !env.JOB_LOCATION) env.JOB_LOCATION = mergedInputs.location;

  return env;
}

function runWorkflowProject(workflow, accTask, timeoutMs) {
  return new Promise(function(resolve) {
    var sourceDir = workflow.package_dir || workflow.source_dir || (workflow.source_path ? path.join(workflow.source_path, 'src') : '');
    var sourceRoot = path.dirname(sourceDir);
    var packageName = path.basename(sourceDir);

    if (!sourceDir || !packageName || !fs.existsSync(sourceDir)) {
      return resolve({
        success: false,
        error: 'CrewAI workflow source directory not found: ' + sourceDir,
        summary: 'Workflow execution failed',
        output: '',
        is_real_ai_result: false,
      });
    }

    var python = process.env.CREWAI_PYTHON_PATH || process.env.PYTHON_PATH || 'python';
    var args = ['-m', packageName + '.main', 'run_with_trigger'];
    var env = buildWorkflowEnv(workflow, accTask);
    var stdout = '';
    var stderr = '';
    var finished = false;
    var timeout = setTimeout(function() {
      if (finished) return;
      finished = true;
      try { child.kill(); } catch (e) {}
      resolve({
        success: false,
        error: 'CrewAI workflow timed out after ' + String(timeoutMs || 120000) + 'ms',
        summary: 'Workflow execution timed out',
        output: stdout.trim(),
        stderr: stderr.trim(),
        is_real_ai_result: false,
      });
    }, timeoutMs || 120000);

    var child = cp.spawn(python, args, {
      cwd: sourceRoot,
      env: env,
      windowsHide: true,
      shell: false,
    });

    child.stdout.on('data', function(chunk) {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', function(chunk) {
      stderr += chunk.toString('utf8');
    });

    child.on('error', function(err) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        error: err.message,
        summary: 'Failed to start CrewAI workflow',
        output: stdout.trim(),
        stderr: stderr.trim(),
        is_real_ai_result: false,
      });
    });

    child.on('close', function(code) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);

      var parsed = parseWorkflowJson(stdout);
      var outputText = stdout.trim();
      var summary = parsed && parsed.summary ? parsed.summary : (outputText ? outputText.slice(0, 240) : 'CrewAI workflow completed');

      if (code === 0 && parsed) {
        resolve(Object.assign({
          success: parsed.success !== false,
          summary: summary,
          output: parsed.output || parsed.raw || outputText,
          stderr: stderr.trim(),
          is_real_ai_result: true,
          workflow_key: workflow.key,
          workflow_id: workflow.id,
          workflow_kind: workflow.kind,
        }, parsed));
        return;
      }

      resolve({
        success: false,
        error: parsed && parsed.error ? parsed.error : (stderr.trim() || ('CrewAI workflow exited with code ' + code)),
        summary: parsed && parsed.summary ? parsed.summary : 'CrewAI workflow failed',
        output: parsed && (parsed.output || parsed.raw) ? (parsed.output || parsed.raw) : outputText,
        stderr: stderr.trim(),
        exit_code: code,
        parsed_output: parsed || null,
        is_real_ai_result: true,
        workflow_key: workflow.key,
        workflow_id: workflow.id,
        workflow_kind: workflow.kind,
      });
    });
  });
}

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
  var workflowMeta = accTask && accTask.meta ? accTask.meta : {};
  if (workflowMeta.workflow_key || workflowMeta.workflow_id || workflowMeta.workflow_name) {
    var workflow = workflowRegistry.resolveWorkflow(
      workflowMeta.workflow_key || workflowMeta.workflow_id || workflowMeta.workflow_name,
      { preferKind: workflowMeta.workflow_kind }
    );

    if (!workflow) {
      return {
        success: false,
        error: 'Workflow not found for task metadata',
        summary: 'Workflow lookup failed',
        output: '',
        is_real_ai_result: false,
      };
    }

    if (workflow.kind !== 'crewai_project') {
      return workflowDispatcher.executeWorkflowTask(accTask);
    }

    return runWorkflowProject(workflow, accTask);
  }

  var task = {
    id:          accTask.id,
    title:       accTask.title,
    instruction: accTask.instruction,
    feature_ref: accTask.feature_ref || '',
  };
  return runTask(task);
}

module.exports = { enabled, checkHealth, runTask, sendTaskFromACC };
