// cloud/orchestrator/intentClassifier.js
const { runDeepseekTask } = require("../connectors/deepseek.js");

const SYSTEM_PROMPT = `
You classify user requests for an AI orchestrator called ACC.

Return ONLY a JSON object with no preamble or markdown. Fields:
- intent: one of ["research","write","document","task","job_search","tailor_resume","apply_job","communication","automation","browse","unknown"]
- connectors: array of connector names to use (e.g. ["notion","clickup","linkedin","indeed","browser","gmail"])
- agents: array of agent types to use (e.g. ["claude","deepseek","browser"])
- priority: "high" | "normal" | "low"
`.trim();

/**
 * classifyIntent
 * Uses DeepSeek to classify a user request into intent + routing metadata.
 * Falls back to safe defaults if DeepSeek is unavailable.
 *
 * @param {string} text - raw user request
 * @returns {Promise<{ intent, connectors, agents, priority, raw }>}
 */
async function classifyIntent(text) {
  const res = await runDeepseekTask({
    mode:   "validate",
    prompt: `${SYSTEM_PROMPT}\n\nUser request:\n"${text}"`,
  });

  const fallback = {
    intent:     "unknown",
    connectors: [],
    agents:     [],
    priority:   "normal",
    raw:        res.error || "",
  };

  if (!res.success) return fallback;

  try {
    const match = res.output.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found in DeepSeek output.");
    const parsed = JSON.parse(match[0]);
    return {
      intent:     parsed.intent     || "unknown",
      connectors: parsed.connectors || [],
      agents:     parsed.agents     || [],
      priority:   parsed.priority   || "normal",
      raw:        res.output,
    };
  } catch (_) {
    return { ...fallback, raw: res.output };
  }
}

module.exports = { classifyIntent };
