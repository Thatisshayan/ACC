// cloud/orchestrator/errorRecovery.js
const { runDeepseekTask } = require("../connectors/deepseek.js");

/**
 * analyzeFailure
 * Uses DeepSeek (validate mode) to inspect a failed node.
 * Returns a recovery decision: retry with fixed payload, or stop.
 *
 * @param {Object} node - failed TaskNode (with .payload, .error, .agentType)
 * @returns {Promise<{ shouldRetry: boolean, fixedPayload?: Object|null, reason?: string }>}
 */
async function analyzeFailure(node) {
  const { payload, error, agentType } = node;

  const prompt = `
The following agent failed:

Agent Type: ${agentType}
Original Payload: ${JSON.stringify(payload, null, 2)}
Error: ${JSON.stringify(error, null, 2)}

Your job:
1. Identify the root cause.
2. Suggest a corrected payload if possible.
3. If retrying is pointless, say so clearly.
`;

  const result = await runDeepseekTask({ mode: "validate", prompt });

  if (!result.success) {
    return {
      shouldRetry: false,
      reason: "DeepSeek validation failed.",
    };
  }

  const text = result.output.toLowerCase();

  // Heuristic: DeepSeek output signals retry is worth attempting
  const shouldRetry =
    text.includes("retry")     ||
    text.includes("fix")       ||
    text.includes("corrected") ||
    text.includes("resolved");

  // Try to extract a corrected JSON payload from DeepSeek output
  let fixedPayload = null;
  try {
    const match = result.output.match(/\{[\s\S]*\}/);
    if (match) fixedPayload = JSON.parse(match[0]);
  } catch (_) {
    // No valid JSON found — fixedPayload stays null
  }

  return {
    shouldRetry,
    fixedPayload,
    reason: result.output,
  };
}

module.exports = { analyzeFailure };
