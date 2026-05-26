'use strict';

const cp     = require('child_process');
const fs     = require('fs');
const path   = require('path');
const store  = require('../taskbus/store.js');
const router = require('../taskbus/router.js');
const registry = require('./registry.js');

// ── CrewAI subprocess execution ──────────────────────────────────────────────
// Only runs when CREWAI_EXECUTION_MODE=execute. Spawns the workflow's own
// main.py via execFile (no shell expansion). Python binary is validated.

var CREWAI_TIMEOUT_MS = parseInt(process.env.CREWAI_TIMEOUT_MS || String(10 * 60 * 1000));

var RAW_PY = process.env.PYTHON_PATH || 'python';
var SAFE_PY_RE = /^(python3?(\.\d+)?|py)$/i;
var CREWAI_PYTHON = SAFE_PY_RE.test(path.basename(RAW_PY)) ? RAW_PY : 'python';

// Ensure the entrypoint is inside the workflow's own source directory.
function pathIsInsideDir(filePath, rootDir) {
  var resolved = path.resolve(filePath);
  var root     = path.resolve(rootDir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function runCrewAIProject(workflow, task) {
  return new Promise(function(resolve) {
    var entrypoint = workflow.entrypoint;
    var sourceDir  = workflow.source_dir;

    if (!entrypoint || !sourceDir) {
      return resolve({ success: false, error: 'Workflow has no entrypoint or source_dir' });
    }
    if (!pathIsInsideDir(entrypoint, sourceDir)) {
      return resolve({ success: false, error: 'Entrypoint is outside workflow source directory' });
    }
    if (!fs.existsSync(entrypoint)) {
      return resolve({ success: false, error: 'Entrypoint not found: ' + entrypoint });
    }

    var input = (task && task.meta && task.meta.workflow_input) ||
                (task && task.instruction) || '';

    var env = Object.assign({}, process.env, {
      CREWAI_TASK_ID:    task ? task.id    : '',
      CREWAI_TASK_INPUT: input,
    });

    console.log('[dispatcher] Spawning CrewAI:', path.basename(entrypoint),
      '| cwd:', path.basename(sourceDir));

    var stdout = '';
    var stderr = '';
    var timedOut = false;

    var child = cp.spawn(CREWAI_PYTHON, [entrypoint], { cwd: sourceDir, env: env, windowsHide: true });

    var timer = setTimeout(function() {
      timedOut = true;
      child.kill('SIGTERM');
    }, CREWAI_TIMEOUT_MS);

    child.stdout.on('data', function(d) { stdout += d.toString(); });
    child.stderr.on('data', function(d) { stderr += d.toString(); });

    child.on('error', function(err) {
      clearTimeout(timer);
      resolve({ success: false, error: 'Failed to spawn: ' + err.message });
    });

    child.on('close', function(code) {
      clearTimeout(timer);
      if (timedOut) {
        return resolve({ success: false, error: 'Timed out after ' + (CREWAI_TIMEOUT_MS / 1000) + 's' });
      }
      if (code !== 0) {
        return resolve({ success: false, error: 'Exited ' + code + ': ' + stderr.slice(0, 400) });
      }
      // Try to parse last JSON line (CrewAI often prints JSON result as last line)
      var lines = stdout.trim().split('\n').filter(Boolean);
      for (var i = lines.length - 1; i >= 0; i--) {
        try {
          var parsed = JSON.parse(lines[i]);
          return resolve(Object.assign({ success: true }, parsed));
        } catch(_) {}
      }
      resolve({ success: true, output: stdout.trim(), summary: 'CrewAI completed' });
    });
  });
}

function safeText(value) {
  return String(value || '').trim();
}

function summarizeWorkflowList(workflows) {
  if (!workflows.length) return 'No workflows found.';
  const lines = ['Available workflows:', ''];
  const grouped = workflows.reduce(function(acc, workflow) {
    const category = String(workflow.category || 'Other').trim() || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(workflow);
    return acc;
  }, {});

  Object.keys(grouped).sort().forEach(function(category) {
    lines.push(category + ':');
    grouped[category].forEach(function(workflow) {
      lines.push('- ' + workflow.key + ' [' + workflow.kind + ']');
      lines.push('  ' + workflow.name);
      if (workflow.description) lines.push('  ' + workflow.description);
      if (workflow.user_command) lines.push('  Command: ' + workflow.user_command);
      lines.push('');
    });
  });
  return lines.join('\n').trim();
}

function buildJobSearchQuery(role) {
  const cleanRole = safeText(role);
  if (!cleanRole) return '';
  return cleanRole + ' jobs';
}

function inferWorkflowFromCommand(text) {
  const raw = safeText(text);
  if (!raw) return null;

  if (/^\/?workflows?$/i.test(raw)) {
    return { type: 'list' };
  }

  let match = raw.match(/^(?:task:\s*)?run workflow:\s*(.+?)(?:\s+(?:for|with|using)\s+(.+))?$/i);
  if (match) {
    const refs = match[1].split(/[,;+]/).map(safeText).filter(Boolean);
    if (refs.length > 1) {
      return { type: 'parallel', workflowRefs: refs, input: safeText(match[2] || '') };
    }
    return { type: 'run', workflowRef: safeText(match[1]), input: safeText(match[2] || '') };
  }

  match = raw.match(/^crew:\s*use-workflow\s+(.+?)(?:\s+(?:for|with|using)\s+(.+))?$/i);
  if (match) {
    const refs = match[1].split(/[,;+]/).map(safeText).filter(Boolean);
    if (refs.length > 1) {
      return { type: 'parallel', workflowRefs: refs, input: safeText(match[2] || '') };
    }
    return { type: 'run', workflowRef: safeText(match[1]), input: safeText(match[2] || '') };
  }

  match = raw.match(/^workflow:\s*(.+?)(?:\s+(?:for|with|using)\s+(.+))?$/i);
  if (match) {
    const body = safeText(match[1]);
    const parallelMatch = body.match(/^parallel\s+(.+)$/i);
    if (parallelMatch) {
      const refs = parallelMatch[1].split(/[,;+]/).map(safeText).filter(Boolean);
      return { type: 'parallel', workflowRefs: refs, input: safeText(match[2] || '') };
    }
    const refs = body.split(/[,;+]/).map(safeText).filter(Boolean);
    if (refs.length > 1) {
      return { type: 'parallel', workflowRefs: refs, input: safeText(match[2] || '') };
    }
    return { type: 'run', workflowRef: safeText(match[1]), input: safeText(match[2] || '') };
  }

  match = raw.match(/^apply for jobs for this role for me:\s*(.+)$/i);
  if (match) {
    return {
      type: 'run',
      workflowRef: 'job_application_workflow',
      preferKind: 'crewai_project',
      role: safeText(match[1]),
      searchQuery: buildJobSearchQuery(match[1]),
      input: safeText(match[1]),
    };
  }

  match = raw.match(/^apply for jobs for this role:\s*(.+)$/i);
  if (match) {
    return {
      type: 'run',
      workflowRef: 'job_application_workflow',
      preferKind: 'crewai_project',
      role: safeText(match[1]),
      searchQuery: buildJobSearchQuery(match[1]),
      input: safeText(match[1]),
    };
  }

  match = raw.match(/^apply for jobs for me:\s*(.+)$/i);
  if (match) {
    return {
      type: 'run',
      workflowRef: 'job_application_workflow',
      preferKind: 'crewai_project',
      role: safeText(match[1]),
      searchQuery: buildJobSearchQuery(match[1]),
      input: safeText(match[1]),
    };
  }

  return null;
}

function buildWorkflowInstruction(workflow, params) {
  const input = safeText(params && (params.input || params.role || params.searchQuery || params.prompt));
  const lines = [
    'Workflow execution request.',
    'Workflow: ' + workflow.name + ' (' + workflow.key + ')',
    'Kind: ' + workflow.kind,
  ];
  if (workflow.description) lines.push('Description: ' + workflow.description);
  if (workflow.command) lines.push('Command: ' + workflow.command);
  if (input) lines.push('User input: ' + input);
  if (Array.isArray(workflow.approval_required_for) && workflow.approval_required_for.length) {
    lines.push('Approval-sensitive actions: ' + workflow.approval_required_for.join(', '));
  }
  if (Array.isArray(workflow.final_outputs) && workflow.final_outputs.length) {
    lines.push('Expected outputs: ' + workflow.final_outputs.join(', '));
  }
  if (workflow.kind === 'publishing_pipeline') {
    lines.push('');
    lines.push('Pipeline shape: Alphonso generates the draft, ACC reviews the output, then SocialClaw handles the distribution handoff after approval.');
    lines.push('Do not skip the ACC review step.');
  }
  if (workflow.kind === 'crewai_project') {
    lines.push('');
    lines.push('Keep the workflow side-by-side with other workflows.');
    lines.push('Prepare a safe plan first, and require approval before any live external action.');
  }
  return lines.join('\n');
}

function buildWorkflowTask(workflow, params) {
  const options = params || {};
  const input = safeText(options.input || options.role || options.searchQuery || options.prompt);
  const highRisk = Array.isArray(workflow.approval_required_for) && workflow.approval_required_for.length > 0;
  const approvalRequired = typeof options.approval_required === 'boolean'
    ? options.approval_required
    : highRisk;
  const isPublishPipeline = workflow.kind === 'publishing_pipeline';

  return store.createTask({
    title: options.title || (isPublishPipeline
      ? '[Workflow] ACC Social Draft Pipeline' + (input ? ' - ' + input.slice(0, 60) : '')
      : ('[Workflow] ' + workflow.name + (input ? ' - ' + input.slice(0, 60) : ''))),
    instruction: options.instruction || buildWorkflowInstruction(workflow, options),
    assigned_agent: isPublishPipeline ? 'alphonso' : (workflow.kind === 'crewai_project' ? 'crewai' : (options.assigned_agent || 'claude')),
    priority: options.priority || ((highRisk || isPublishPipeline) ? 'high' : 'normal'),
    required_output: options.required_output || (isPublishPipeline
      ? 'Social-ready draft, review notes, and handoff'
      : 'Workflow execution plan and output'),
    approval_required: approvalRequired,
    automation_mode: options.automation_mode || 'semi_auto',
    feature_ref: options.feature_ref || ('workflow:' + workflow.key),
    created_by: options.created_by || 'chatgpt',
    request_id: options.request_id || null,
    meta: Object.assign({
      workflow_key: workflow.key,
      workflow_id: workflow.id,
      workflow_kind: workflow.kind,
      workflow_name: workflow.name,
      workflow_source_path: workflow.source_path,
      workflow_command: workflow.command,
      workflow_user_command: workflow.user_command,
      workflow_input: input,
      workflow_parallel_group: options.parallel_group || null,
      workflow_stage: isPublishPipeline ? 'generate' : null,
      workflow_target_connector: isPublishPipeline ? 'socialclaw' : null,
      workflow_params: Object.assign({}, options)
    }, options.meta || {})
  });
}

async function executeWorkflowTask(task) {
  const workflow = registry.resolveWorkflow(
    task && task.meta && (task.meta.workflow_key || task.meta.workflow_id || task.meta.workflow_name),
    { preferKind: task && task.meta && task.meta.workflow_kind }
  );

  if (!workflow) {
    return {
      success: false,
      error: 'Workflow not found for task metadata',
      summary: 'Workflow lookup failed',
      output: '',
      files_changed: [],
      risks: ['workflow_not_found'],
      next_request: 'Check the workflow registry and try again.',
      is_real_ai_result: false,
    };
  }

  // ── EXECUTE mode: actually run the CrewAI subprocess ─────────────────────
  if (workflow.kind === 'crewai_project' && process.env.CREWAI_EXECUTION_MODE === 'execute') {
    const result = await runCrewAIProject(workflow, task);
    return {
      success: result.success,
      workflow_key: workflow.key,
      workflow_id: workflow.id,
      workflow_kind: workflow.kind,
      execution_mode: 'execute',
      summary: result.success
        ? (result.summary || 'CrewAI workflow completed: ' + workflow.name)
        : ('CrewAI workflow failed: ' + result.error),
      output: result.output || (result.success ? '' : result.error || ''),
      files_changed: result.files_changed || [],
      risks: Array.isArray(workflow.approval_required_for) ? workflow.approval_required_for : [],
      next_request: result.next_request || (result.success
        ? 'Review the CrewAI output and confirm results.'
        : 'Check CrewAI logs and retry or adjust workflow inputs.'),
      is_real_ai_result: result.success,
      error: result.success ? undefined : result.error,
    };
  }

  // ── PREPARE mode: workflow is registered but execution is gated ───────────
  const input = safeText(task && task.meta && (task.meta.workflow_input || task.instruction));
  return {
    success: true,
    workflow_key: workflow.key,
    workflow_id: workflow.id,
    workflow_kind: workflow.kind,
    execution_mode: 'prepare',
    summary: workflow.kind === 'crewai_project'
      ? 'CrewAI workflow ready. Set CREWAI_EXECUTION_MODE=execute to run.'
      : 'Workflow prepared: ' + workflow.name,
    output: JSON.stringify({
      workflow: registry.getWorkflowSummary(workflow),
      task: {
        id: task.id,
        title: task.title,
        assigned_agent: task.assigned_agent,
        approval_required: task.approval_required,
        automation_mode: task.automation_mode,
      },
      input: input,
      execution: {
        mode: 'prepare',
        note: workflow.kind === 'crewai_project'
          ? 'Set CREWAI_EXECUTION_MODE=execute in .env and restart to enable live execution.'
          : 'Workflow is registered and routed cleanly.',
        parallel_ready: true,
      },
    }, null, 2),
    files_changed: [],
    risks: Array.isArray(workflow.approval_required_for) ? workflow.approval_required_for : [],
    next_request: workflow.kind === 'crewai_project'
      ? 'Set CREWAI_EXECUTION_MODE=execute to run, or review the workflow manifest.'
      : 'Review the workflow manifest and trigger the desired run.',
    is_real_ai_result: false,
  };
}

async function launchWorkflow(workflowRef, params) {
  const options = params || {};
  const workflow = registry.resolveWorkflow(workflowRef, { preferKind: options.preferKind });
  if (!workflow) {
    return { success: false, error: 'Workflow not found: ' + workflowRef };
  }

  const task = buildWorkflowTask(workflow, options);
  const routeResult = options.skipRoute ? { status: 'pending', taskId: task.id } : await router.routeTask(task.id);
  return {
    success: true,
    workflow: registry.getWorkflowSummary(workflow),
    task: task,
    routing: routeResult,
    status: routeResult && routeResult.status ? routeResult.status : 'pending',
  };
}

async function launchWorkflowsInParallel(workflowRefs, params) {
  const refs = Array.isArray(workflowRefs) ? workflowRefs.filter(Boolean) : [];
  const options = params || {};
  const batchId = options.batch_id || ('workflow-batch-' + Date.now());

  const results = await Promise.allSettled(refs.map(function(ref) {
    return launchWorkflow(ref, Object.assign({}, options, {
      parallel_group: batchId,
    }));
  }));

  return {
    success: true,
    batch_id: batchId,
    results: results.map(function(result, idx) {
      if (result.status === 'fulfilled') return result.value;
      return {
        success: false,
        workflow_ref: refs[idx],
        error: result.reason && result.reason.message ? result.reason.message : String(result.reason),
      };
    }),
  };
}

function describeWorkflowCatalog() {
  return summarizeWorkflowList(registry.listWorkflows());
}

module.exports = {
  describeWorkflowCatalog,
  inferWorkflowFromCommand,
  buildWorkflowInstruction,
  buildWorkflowTask,
  executeWorkflowTask,
  launchWorkflow,
  launchWorkflowsInParallel,
};
