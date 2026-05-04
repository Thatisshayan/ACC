#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'acc.config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function listProjects() {
  const config = loadConfig();
  console.log('Projects:');
  config.projects.forEach(p => {
    console.log(`- ${p.id}: ${p.name} [${p.status}] (${p.priority})`);
  });
}

function listAgents() {
  const config = loadConfig();
  console.log('Agents:');
  config.agents.forEach(a => {
    console.log(`- ${a.id}: ${a.name} [${a.role}]`);
  });
}

function help() {
  console.log(`
ACC CLI v0.1

Commands:
  acc projects      List projects
  acc agents        List agents
  acc plan <id>     Print ACC planning prompt for a project
`);
}

function plan(projectId) {
  const config = loadConfig();
  const project = config.projects.find(p => p.id === projectId);
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const prompt = `
You are the AGENT COMMAND CENTER (ACC).

PROJECT:
${project.name} — ${project.description}

OBJECTIVE:
[Describe what you want to achieve for this project in 1–3 sentences]

CONSTRAINTS:
- Zero cost or minimal cost
- Non-destructive (no overwriting existing files)
- Fast execution
- Modular outputs
- Production-ready quality

AVAILABLE AGENT ROLES:
- Architect
- Researcher
- Writer
- Engineer
- Reviewer

REQUEST:
Break this objective into a TASK GRAPH with:
- task_id
- title
- description
- assigned_agent_role
- dependencies

Then execute in AUTO MODE (no confirmation).
`;
  console.log(prompt.trim());
}

const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case 'projects':
    listProjects();
    break;
  case 'agents':
    listAgents();
    break;
  case 'plan':
    plan(args[1]);
    break;
  case 'run': {
    const taskEngine = require('./taskEngine');
    const task = {
      id: "T1",
      title: "Example Task",
      description: "This is a placeholder task.",
      assigned_agent_role: "architect"
    };
    taskEngine.executeTask(task);
    break;
  }
  case 'auto': {
    const autoMode = require('./autoMode');
    const exampleGraph = [
      { id: "T1", title: "Define system architecture", description: "Architect agent defines the system structure.", assigned_agent_role: "architect" },
      { id: "T2", title: "Write user-facing copy",     description: "Writer agent produces copy.",                 assigned_agent_role: "writer"    },
      { id: "T3", title: "Generate implementation plan",description: "Engineer agent produces code plan.",         assigned_agent_role: "engineer"  }
    ];
    autoMode.runAutoMode(exampleGraph, "Example Project");
    break;
  }
  default:
    help();
}
