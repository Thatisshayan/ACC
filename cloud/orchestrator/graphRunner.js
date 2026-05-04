// cloud/orchestrator/graphRunner.js
const { enqueueTask, getTask }         = require("../queue.js");
const { decideNextAction, AUTO_MODES } = require("./autoMode.js");
const { saveSnapshot, loadSnapshot }   = require("./snapshots.js");
const { analyzeFailure }               = require("./errorRecovery.js");

/**
 * runGraphStep
 * - Enqueue runnable nodes (whose dependencies are completed)
 * - Poll their status
 * - On failure: run DeepSeek error recovery → auto-fix → retry if possible
 * - Update snapshot
 * - Decide whether to continue automatically based on autoMode
 *
 * Call this repeatedly until it returns { done: true }.
 *
 * @param {Object} params
 * @param {string} params.snapshotId
 * @param {Array}  params.graph     - array of TaskNode (only used on first call)
 * @param {string} params.autoMode  - one of AUTO_MODES values
 * @returns {Promise<{ done: boolean, snapshot: Object }>}
 */
async function runGraphStep({ snapshotId, graph, autoMode }) {
  let snap = loadSnapshot(snapshotId);

  // First call: initialize snapshot from graph
  if (!snap) {
    const nodes = graph.map((node) => ({
      ...node,
      status:    "pending",
      result:    null,
      error:     null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskId:    null,
    }));

    snap = {
      id:       snapshotId,
      nodes,
      meta:     { autoMode: autoMode || AUTO_MODES.BALANCED },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveSnapshot(snapshotId, snap);
  }

  const nodes = snap.nodes;

  // 1) Enqueue all runnable nodes (pending + deps completed + no taskId yet)
  for (const node of nodes) {
    if (node.status !== "pending" || node.taskId) continue;

    const deps        = node.dependsOn || [];
    const allDepsDone = deps.every((depId) => {
      const depNode = nodes.find((n) => n.id === depId);
      return depNode && depNode.status === "completed";
    });

    if (!allDepsDone) continue;

    const task = enqueueTask({
      agentType: node.agentType,
      payload:   node.payload,
      meta:      { ...node.meta, snapshotId }, // pass snapshotId so merge engine can read prior outputs
    });

    node.taskId    = task.id;
    node.status    = "running";
    node.updatedAt = new Date().toISOString();
  }

  saveSnapshot(snapshotId, snap);

  // 2) Poll running tasks — update statuses + auto-recovery on failure
  for (const node of nodes) {
    if (node.status !== "running" || !node.taskId) continue;

    const t = getTask(node.taskId);
    if (!t) continue;

    if (t.status === "completed") {
      node.status    = "completed";
      node.result    = t.result;
      node.error     = null;
      node.updatedAt = new Date().toISOString();

    } else if (t.status === "failed") {
      node.status    = "failed";
      node.error     = t.error;
      node.updatedAt = new Date().toISOString();

      // ── Error Recovery (immune system) ──────────────────────────────────
      console.log(`[graphRunner] Node ${node.id} failed. Running DeepSeek recovery...`);

      const recovery = await analyzeFailure(node);

      if (recovery.shouldRetry && recovery.fixedPayload) {
        console.log(`[graphRunner] Auto-fix found for ${node.id}. Resetting to pending.`);
        node.status    = "pending";
        node.payload   = recovery.fixedPayload;
        node.error     = null;
        node.taskId    = null;
        node.updatedAt = new Date().toISOString();
      } else {
        console.log(`[graphRunner] No auto-fix for ${node.id}. Reason: ${recovery.reason}`);
      }
      // ────────────────────────────────────────────────────────────────────
    }
  }

  saveSnapshot(snapshotId, snap);

  // 3) Decide whether to continue automatically
  const decision = decideNextAction({
    autoMode: snap.meta.autoMode,
    nodes,
  });

  const allDone = nodes.every(
    (n) => n.status === "completed" || n.status === "failed"
  );

  return {
    done:     allDone || !decision.continueAutomatically,
    snapshot: loadSnapshot(snapshotId),
  };
}

module.exports = { runGraphStep, AUTO_MODES };
