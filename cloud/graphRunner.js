// cloud/graphRunner.js
// Sequential graph runner with STM/LTM memory, dynamic expansion, and snapshot security.

const { memoryEngine }          = require("./memory/memoryEngine.js");
const { executeTask }           = require("./executor.js");
const { expandGraph }           = require("./orchestrator/graphExpander.js");
const { log }                   = require("./utils/logger.js");
const { createSnapshot }        = require("./security/ephemeralSnapshots.js");
const { notifyApprovalRequest } = require("./telegram/approvalBot.js");
const { requiresSnapshotApproval } = require("./security/policy.js");
const { broadcast }             = require("./ws/server.js");
const { redactObject }          = require("./security/piiRedactor.js");

class Snapshot {
  constructor(nodes = []) {
    this.nodes   = nodes;
    this.outputs = {};
    this.memory  = {};
  }
  getNodeOutput(id)        { return this.outputs[id] || null; }
  setNodeOutput(id, output){ this.outputs[id] = output; }
}

// Recursively walk a payload object and replace "{{NODE_ID.output}}" tokens
// with the text/output from already-completed nodes in the snapshot.
function resolvePayloadRefs(payload, snapshot) {
  if (typeof payload === 'string') {
    return payload.replace(/\{\{([A-Z0-9_]+)\.output\}\}/g, (_, nodeId) => {
      const out = snapshot.getNodeOutput(nodeId);
      if (!out) return `[${nodeId} output pending]`;
      return typeof out.text === 'string' ? out.text
           : typeof out.output === 'string' ? out.output
           : JSON.stringify(out);
    });
  }
  if (Array.isArray(payload)) return payload.map(v => resolvePayloadRefs(v, snapshot));
  if (payload && typeof payload === 'object') {
    const resolved = {};
    for (const [k, v] of Object.entries(payload)) resolved[k] = resolvePayloadRefs(v, snapshot);
    return resolved;
  }
  return payload;
}

async function runGraph(nodes, context = {}) {
  const snapshot = new Snapshot(nodes);
  memoryEngine.initSTM(snapshot);

  for (let i = 0; i < snapshot.nodes.length; i++) {
    const node = snapshot.nodes[i];
    log("Running node:", node.id, `(${node.agentType})`);

    // Resolve {{NODE_ID.output}} placeholders in payload strings before execution
    const resolvedPayload = resolvePayloadRefs(node.payload, snapshot);

    const result = await executeTask({
      id:        node.id,
      agentType: node.agentType,
      payload:   resolvedPayload,
      meta:      { ...node.meta, snapshotId: context.snapshotId || null },
      snapshot,
    });

    // ── Security: snapshot approval for sensitive/approval nodes ──────────────
    const needsSnap = requiresSnapshotApproval() &&
      (node.meta?.sensitive || node.meta?.requiresApproval || node.agentType === "browser");

    if (needsSnap) {
      // Redact PII before creating snapshot preview
      const redactedResult = redactObject(typeof result === "object" ? result : { output: String(result) });

      const preview = {
        nodeId:        node.id,
        agentType:     node.agentType,
        meta:          node.meta,
        outputSummary: JSON.stringify(redactedResult).slice(0, 2000), // redacted, truncated
        // fullOutput is NOT stored in the snapshot — kept ephemeral only
      };

      const snap = createSnapshot({
        data: preview,
        meta: {
          nodeId:    node.id,
          createdBy: context.role || node.meta?.role || "Agent",
          taskId:    context.taskId || null,
        },
      });

      // Output with pending flag — do NOT persist to LTM until approved
      snapshot.setNodeOutput(node.id, { ...result, snapshotId: snap.id, pendingApproval: true });
      memoryEngine.addSTMFact(snapshot, { nodeId: node.id, snapshotId: snap.id, pendingApproval: true });

      try {
        await notifyApprovalRequest({
          snapshotId: snap.id,
          summary:    `Node ${node.id} (${node.agentType}) produced a pending snapshot.`,
        });
      } catch (e) {
        log("[graphRunner] notifyApprovalRequest failed:", e.message);
      }

      log("[graphRunner] Snapshot created:", snap.id, "— awaiting Shayan approval.");
    } else {
      snapshot.setNodeOutput(node.id, result);
      memoryEngine.addSTMFact(snapshot, { nodeId: node.id, output: result });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Broadcast node completion to UI via WebSocket
    try {
      broadcast("nodeUpdate", {
        nodeId:         node.id,
        agentType:      node.agentType,
        resultSummary:  typeof result === "object" ? JSON.stringify(result).slice(0, 500) : String(result),
        pendingApproval: snapshot.getNodeOutput(node.id)?.pendingApproval || false,
      });
    } catch (_) { /* non-fatal */ }

    // Dynamic graph expansion
    const newNodes = await expandGraph(snapshot, node.id);
    if (Array.isArray(newNodes) && newNodes.length) {
      for (const n of newNodes) {
        if (!snapshot.nodes.find(x => x.id === n.id)) {
          snapshot.nodes.push(n);
          log("Graph expanded — added node:", n.id);
        } else {
          log("Skipped duplicate node:", n.id);
        }
      }
    }
  }

  // Merge STM → LTM (only non-pending facts)
  memoryEngine.mergeSTMtoLTM(snapshot);

  try {
    await memoryEngine.saveLTM(async (data) => {
      const { saveToNotion } = require("./memory/notionStorage.js");
      return await saveToNotion(data);
    });
  } catch (e) {
    log("[graphRunner] LTM save failed:", e.message);
  }

  return snapshot;
}

module.exports = { Snapshot, runGraph };
