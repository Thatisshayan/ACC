const taskEngine = require('./taskEngine');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, 'snapshots.json');

function loadSnapshots() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function saveSnapshots(data) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  runAutoMode(taskGraph, projectName) {
    console.log(`\n=== ACC AUTO MODE — ${projectName} ===\n`);

    const executionLog = [];

    for (const task of taskGraph) {
      console.log(`\nExecuting Task ${task.id}: ${task.title}`);
      taskEngine.executeTask(task);
      executionLog.push({
        id: task.id,
        title: task.title,
        role: task.assigned_agent_role,
        status: "executed"
      });
    }

    const snapshot = {
      timestamp: new Date().toISOString(),
      project: projectName,
      execution_log: executionLog
    };

    const data = loadSnapshots();
    data.sessions.push(snapshot);
    saveSnapshots(data);

    console.log("\n=== AUTO MODE COMPLETE ===");
    console.log("Snapshot saved.\n");
  }
};
