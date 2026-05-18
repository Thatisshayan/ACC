// cloud/connectors/claude.js
// Claude is DISABLED — credits depleted. Returns failure so executor falls through to Smart Stub.
// Re-enable by removing the early return when credits are added.
const axios = require("axios");
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

async function runClaudeTask(payload = {}) {
  // Credits depleted — skip Claude, let executor use Smart Stub
  return { success: false, error: "Claude disabled: credits depleted. Add credits at console.anthropic.com" };
}

module.exports = { runClaudeTask };
