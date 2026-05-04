// cloud/orchestrator/mergeEngine.js
const { runDeepseekTask } = require("../connectors/deepseek.js");

/**
 * mergeConnectorResults
 * Uses DeepSeek to merge, deduplicate, normalize, and rank results
 * from multiple connectors into a single clean JSON array.
 *
 * Falls back to a simple array concat if DeepSeek is unavailable.
 *
 * @param {Array}  resultsArray - array of connector outputs (any shape)
 * @param {string} mergeType   - hint for DeepSeek: "job_search" | "research" | "generic" etc.
 * @returns {Promise<{ success: boolean, output?: Array, error?: string, raw?: string }>}
 */
async function mergeConnectorResults(resultsArray, mergeType = "generic") {
  // Filter out failed/empty results before sending to DeepSeek
  const validResults = resultsArray.filter(r => r && (r.success !== false));

  if (validResults.length === 0) {
    return { success: false, error: "mergeEngine: no valid results to merge." };
  }

  const prompt = `
You are merging results from multiple connectors into one unified list.

Merge type: ${mergeType}

Input data:
${JSON.stringify(validResults, null, 2)}

Your job:
1. Merge all items into one unified list.
2. Remove exact and near-duplicate entries.
3. Normalize field names (e.g. "job_title" and "title" → "title").
4. Rank by relevance to the merge type.
5. Output ONLY a valid JSON array. No preamble, no markdown.
`.trim();

  const res = await runDeepseekTask({ mode: "validate", prompt });

  if (!res.success) {
    // Graceful fallback: concat raw outputs without AI merging
    const fallback = validResults.flatMap(r => {
      if (Array.isArray(r)) return r;
      if (Array.isArray(r?.output)) return r.output;
      return [r];
    });
    return {
      success:  true,
      output:   fallback,
      fallback: true,
      error:    `DeepSeek unavailable: ${res.error}`,
    };
  }

  try {
    // Accept both array [...] and object-wrapped { output: [...] }
    const match = res.output.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array found in DeepSeek output.");
    const parsed = JSON.parse(match[0]);
    return { success: true, output: parsed };
  } catch (err) {
    // Fallback: return raw concatenation
    const fallback = validResults.flatMap(r => Array.isArray(r?.output) ? r.output : [r]);
    return {
      success:  true,
      output:   fallback,
      fallback: true,
      error:    `JSON parse failed: ${err.message}`,
      raw:      res.output,
    };
  }
}

module.exports = { mergeConnectorResults };
