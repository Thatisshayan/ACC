'use strict';

const fs = require('fs');
const path = require('path');

const WORKFLOWS_ROOT = __dirname;
const CHATGPT_DIR = path.join(WORKFLOWS_ROOT, 'chatgpt');
const CREWAI_DIR = path.join(WORKFLOWS_ROOT, 'crewai');
const MASTER_CHATGPT_FILE = path.join(CHATGPT_DIR, '_master_workflows.json');

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function humanize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, function(ch) { return ch.toUpperCase(); })
    .trim();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function collectAliases(base) {
  return unique([
    base.id,
    base.key,
    base.name,
    base.slug,
    base.command,
    base.description,
    base.user_command,
    ...(base.aliases || [])
  ].map(function(item) { return String(item || '').trim(); }));
}

function scanChatgptWorkflowFiles() {
  if (!fs.existsSync(CHATGPT_DIR)) return [];

  const master = readJson(MASTER_CHATGPT_FILE) || {};
  const masterById = new Map();
  if (Array.isArray(master.workflows)) {
    master.workflows.forEach(function(workflow) {
      if (workflow && workflow.id) masterById.set(workflow.id, workflow);
    });
  }

  return fs.readdirSync(CHATGPT_DIR)
    .filter(function(file) { return file.endsWith('.json') && file !== '_master_workflows.json'; })
    .map(function(file) {
      const filePath = path.join(CHATGPT_DIR, file);
      const manifest = readJson(filePath);
      if (!manifest) return null;
      const fallback = masterById.get(manifest.id) || {};
      const id = manifest.id || path.basename(file, '.json');
      const key = 'chatgpt:' + id;
      const userCommand = manifest.user_command || fallback.user_command || 'task: run workflow: ' + id;
      return {
        key: key,
        kind: 'chatgpt_json',
        id: id,
        slug: slugify(id),
        name: manifest.name || fallback.name || humanize(id),
        category: manifest.category || fallback.category || 'Workflow',
        description: manifest.description || fallback.description || '',
        user_command: userCommand,
        command: 'task: run workflow: ' + id,
        source_path: filePath,
        source_dir: CHATGPT_DIR,
        flow: Array.isArray(manifest.flow) ? manifest.flow : [],
        lanes: Array.isArray(manifest.lanes) ? manifest.lanes : [],
        approval_required_for: Array.isArray(manifest.approval_required_for)
          ? manifest.approval_required_for
          : [],
        final_outputs: Array.isArray(manifest.final_outputs) ? manifest.final_outputs : [],
        aliases: collectAliases({
          id: id,
          key: key,
          name: manifest.name || fallback.name || humanize(id),
          slug: slugify(id),
          command: userCommand,
          description: manifest.description || fallback.description || '',
          user_command: userCommand,
          aliases: [
            'chatgpt:' + id,
            'workflow:' + id,
            'run workflow ' + id
          ]
        }),
      };
    })
    .filter(Boolean);
}

function detectCrewSourceDir(rootDir) {
  const srcDir = path.join(rootDir, 'src');
  if (!fs.existsSync(srcDir)) return null;

  const children = fs.readdirSync(srcDir, { withFileTypes: true })
    .filter(function(entry) { return entry.isDirectory(); })
    .map(function(entry) { return entry.name; });

  if (!children.length) return null;

  const preferred = children.find(function(name) {
    return fs.existsSync(path.join(srcDir, name, 'main.py'));
  });
  return preferred ? path.join(srcDir, preferred) : path.join(srcDir, children[0]);
}

function parsePyProjectName(rootDir, fallbackName) {
  const pyproject = path.join(rootDir, 'pyproject.toml');
  if (!fs.existsSync(pyproject)) return fallbackName;
  const text = fs.readFileSync(pyproject, 'utf8');
  const match = text.match(/^\s*name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : fallbackName;
}

function scanCrewaiProjects() {
  if (!fs.existsSync(CREWAI_DIR)) return [];

  return fs.readdirSync(CREWAI_DIR, { withFileTypes: true })
    .filter(function(entry) {
      return entry.isDirectory() && !entry.name.startsWith('.');
    })
    .map(function(entry) {
      const rootDir = path.join(CREWAI_DIR, entry.name);
      const pyprojectPath = path.join(rootDir, 'pyproject.toml');
      const srcRoot = detectCrewSourceDir(rootDir);
      if (!fs.existsSync(pyprojectPath) || !srcRoot) return null;

      const fallbackId = entry.name.replace(/-project$/i, '');
      const projectId = parsePyProjectName(rootDir, fallbackId);
      const projectName = humanize(projectId);
      const isCareerWorkflow = projectId === 'autonomous_resume_driven_job_search_with_clickup_integration';
      const aliases = [
        entry.name,
        projectId,
        projectName,
        'crew:' + projectId,
        'workflow:' + projectId,
        'run workflow ' + projectId,
      ];

      if (isCareerWorkflow) {
        aliases.push(
          'autonomous resume driven job search with clickup integration'
        );
      }

      return {
        key: 'crewai:' + entry.name,
        kind: 'crewai_project',
        id: projectId,
        slug: slugify(projectId),
        name: projectName,
        category: isCareerWorkflow ? 'Career' : 'CrewAI',
        description: isCareerWorkflow
          ? 'CrewAI workflow for resume-driven job search, tailoring, and ClickUp tracking.'
          : 'CrewAI project available beside other workflows in ACC.',
        user_command: isCareerWorkflow
          ? 'crew: use-workflow autonomous_resume_driven_job_search_with_clickup_integration'
          : 'crew: use-workflow ' + projectId,
        command: 'crew: use-workflow ' + projectId,
        source_path: rootDir,
        source_dir: rootDir,
        entrypoint: path.join(srcRoot, 'main.py'),
        package_dir: srcRoot,
        approval_required_for: isCareerWorkflow
          ? ['submitting applications', 'sending emails/messages', 'uploading private documents']
          : [],
        final_outputs: isCareerWorkflow
          ? ['job tracker entries', 'resume variants', 'cover letters', 'application status report']
          : ['workflow run result'],
        aliases: collectAliases({
          id: projectId,
          key: 'crewai:' + entry.name,
          name: projectName,
          slug: slugify(projectId),
          command: 'crew: use-workflow ' + projectId,
          description: isCareerWorkflow
            ? 'CrewAI workflow for resume-driven job search, tailoring, and ClickUp tracking.'
            : 'CrewAI project available beside other workflows in ACC.',
          user_command: isCareerWorkflow
            ? 'crew: use-workflow autonomous_resume_driven_job_search_with_clickup_integration'
            : 'crew: use-workflow ' + projectId,
          aliases: aliases
        }),
      };
    })
    .filter(Boolean);
}

function listWorkflows() {
  const workflows = [
    ...scanChatgptWorkflowFiles(),
    ...scanCrewaiProjects(),
  ];

  const seen = new Set();
  return workflows.filter(function(workflow) {
    if (seen.has(workflow.key)) return false;
    seen.add(workflow.key);
    return true;
  });
}

function matchWorkflow(workflow, query) {
  if (!workflow || !query) return false;
  const target = String(query).trim().toLowerCase();
  return collectAliases(workflow).some(function(alias) {
    const value = String(alias || '').trim().toLowerCase();
    if (!value) return false;
    return value === target || value.indexOf(target) !== -1 || target.indexOf(value) !== -1;
  });
}

function resolveWorkflow(query, opts) {
  const options = opts || {};
  const workflows = listWorkflows();
  const target = String(query || '').trim().toLowerCase();
  if (!target) return null;

  const preferKind = options.preferKind || '';

  const exact = workflows.find(function(workflow) {
    return [
      workflow.key,
      workflow.id,
      workflow.slug,
      workflow.name
    ].some(function(field) {
      return String(field || '').toLowerCase() === target;
    });
  });
  if (exact && (!preferKind || exact.kind === preferKind)) return exact;

  const preferredAlias = workflows.find(function(workflow) {
    return (!preferKind || workflow.kind === preferKind) && matchWorkflow(workflow, target);
  });
  if (preferredAlias) return preferredAlias;

  return workflows.find(function(workflow) {
    return matchWorkflow(workflow, target);
  }) || null;
}

function getWorkflowSummary(workflow) {
  if (!workflow) return null;
  return {
    key: workflow.key,
    id: workflow.id,
    name: workflow.name,
    kind: workflow.kind,
    category: workflow.category,
    description: workflow.description,
    command: workflow.command,
    user_command: workflow.user_command,
    approval_required_for: workflow.approval_required_for || [],
    final_outputs: workflow.final_outputs || [],
    source_path: workflow.source_path,
  };
}

module.exports = {
  listWorkflows,
  resolveWorkflow,
  getWorkflowSummary,
};
