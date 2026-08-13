// cloud/workflows/crewai/job-workflow-runner.js
// CommonJS module - CrewAI Job Application Workflow Runner stub
'use strict';

async function runJobWorkflow(params) {
  console.log('[job-workflow-runner] Stub runJobWorkflow called with:', params);
  return {
    success: false,
    error: "CrewAI runner is not fully configured.",
    timestamp: new Date().toISOString()
  };
}

module.exports = { runJobWorkflow };
