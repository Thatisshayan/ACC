// cloud/orchestrator/graphExpander.js
// Uses DeepSeek to dynamically expand a running graph after each node completes.
// Returns an array of new TaskNode objects (or [] if nothing to add).

const { runDeepseekTask } = require("../connectors/deepseek.js");

/**
 * expandGraph
 * After a node completes, asks DeepSeek whether new nodes should be added.
 *
 * @param {Object} snapshot    - Snapshot instance with .nodes and .outputs
 * @param {string} lastNodeId  - ID of the just-completed node
 * @returns {Promise<Array>}   - Array of new TaskNode objects, or []
 */
async function expandGraph(snapshot, lastNodeId) {
  const lastOutput = snapshot.getNodeOutput
    ? snapshot.getNodeOutput(lastNodeId)
    : null;

  const prompt = `
You are ACC's workflow expansion engine.

Given:
- The last completed node: ${lastNodeId}
- Its output: ${JSON.stringify(lastOutput, null, 2)}
- The current graph: ${JSON.stringify(snapshot.nodes || [], null, 2)}

Your job:
1. Decide if new nodes should be added to improve the workflow.
2. Only add nodes that are genuinely needed and not already present.
3. Output a JSON array of new nodes, or an empty array [].

Node format:
{
  "id": "string",
  "agentType": "string",
  "payload": {},
  "dependsOn": ["NODE_ID"],
  "meta": {}
}

Return ONLY a valid JSON array. No preamble, no markdown.
`.trim();

  const res = await runDeepseekTask({ mode: "validate", prompt });

  if (!res.success) return [];

  try {
    const match = res.output.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

module.exports = { expandGraph };
