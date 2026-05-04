const fs = require('fs');
const path = require('path');
const router = require('./router');

const TASKS_PATH = path.join(__dirname, 'tasks.json');
const SNAPSHOT_PATH = path.join(__dirname, 'snapshots.json');

function loadTasks() {
  return JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
}

function saveTasks(data) {
  fs.writeFileSync(TASKS_PATH, JSON.stringify(data, null, 2));
}

function loadSnapshots() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function saveSnapshots(data) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  executeTask(task) {
    const target = router.routeTask(task);

    console.log(`
TASK EXECUTION PACKAGE:

AGENT TARGET: ${target}
ROLE: ${task.assigned_agent_role}
TASK: ${task.title}

Paste the following into the target AI:

----------------------------------------
You are acting as the ${task.assigned_agent_role} agent.

TASK:
${task.description}

OUTPUT FORMAT:
${task.output_format || "Return clean, production-ready output."}
----------------------------------------
`);

    const tasks = loadTasks();
    tasks.tasks.push(task);
    saveTasks(tasks);
  },

  saveSnapshot(snapshot) {
    const data = loadSnapshots();
    data.sessions.push(snapshot);
    saveSnapshots(data);
  }
};
