'use strict';

const store = require('../taskbus/store.js');
const router = require('../taskbus/router.js');
const registry = require('./registry.js');

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

  return store.createTask({
    title: options.title || ('[Workflow] ' + workflow.name + (input ? ' - ' + input.slice(0, 60) : '')),
    instruction: options.instruction || buildWorkflowInstruction(workflow, options),
    assigned_agent: workflow.kind === 'crewai_project' ? 'crewai' : (options.assigned_agent || 'claude'),
    priority: options.priority || (highRisk ? 'high' : 'normal'),
    required_output: options.required_output || 'Workflow execution plan and output',
    approval_required: approvalRequired,
    automation_mode: options.automation_mode || (workflow.kind === 'crewai_project' ? 'semi_auto' : 'semi_auto'),
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

  const input = safeText(task && task.meta && (task.meta.workflow_input || task.instruction));
  const response = {
    success: true,
    workflow_key: workflow.key,
    workflow_id: workflow.id,
    workflow_kind: workflow.kind,
    summary: 'Prepared workflow: ' + workflow.name,
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
        note: 'Workflow is registered and routed cleanly beside other workflows.',
        parallel_ready: true,
      },
    }, null, 2),
    files_changed: [],
    risks: Array.isArray(workflow.approval_required_for) ? workflow.approval_required_for : [],
    next_request: workflow.kind === 'crewai_project'
      ? 'Approve the workflow task to continue or adjust the role/query.'
      : 'Review the workflow manifest and trigger the desired run.',
    is_real_ai_result: false,
  };

  if (workflow.kind === 'crewai_project' && process.env.CREWAI_EXECUTION_MODE === 'execute') {
    response.summary = 'CrewAI workflow execution is enabled, but this lane is still guarded by ACC approval.';
    response.execution_mode = 'execute';
  }

  return response;
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
