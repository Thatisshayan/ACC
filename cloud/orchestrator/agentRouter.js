// cloud/orchestrator/agentRouter.js

/**
 * pickAgentsForIntent
 * Returns the recommended agent types for a given intent.
 * @param {string} intent
 * @returns {string[]}
 */
function pickAgentsForIntent(intent) {
  switch (intent) {
    case "job_search":
      return ["linkedin", "indeed", "browser", "deepseek", "claude"];

    case "tailor_resume":
      return ["browser", "notion", "claude", "deepseek"];

    case "apply_job":
      return ["linkedin", "indeed", "browser", "claude", "deepseek", "clickup"];

    case "research":
    case "browse":
      return ["browser", "deepseek", "claude"];

    case "document":
    case "write":
      return ["claude", "deepseek"];

    case "task":
      return ["claude", "clickup"];

    case "communication":
      return ["claude", "gmail"];

    case "automation":
      return ["claude", "deepseek", "clickup"];

    default:
      return ["claude"];
  }
}

module.exports = { pickAgentsForIntent };
