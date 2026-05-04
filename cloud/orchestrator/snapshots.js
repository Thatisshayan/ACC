// cloud/orchestrator/snapshots.js
// In-memory snapshot store. Swap to Redis/Postgres later without changing callers.

const snapshots = new Map();

/**
 * saveSnapshot
 * @param {string} snapshotId
 * @param {Object} data - { graph, nodes, meta }
 */
function saveSnapshot(snapshotId, data) {
  if (!snapshotId) throw new Error("snapshotId is required");
  snapshots.set(snapshotId, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * loadSnapshot
 * @param {string} snapshotId
 * @returns {Object|null}
 */
function loadSnapshot(snapshotId) {
  if (!snapshotId) return null;
  return snapshots.get(snapshotId) || null;
}

/**
 * updateNodeInSnapshot
 * @param {string} snapshotId
 * @param {string} nodeId
 * @param {Object} patch - partial node fields to merge
 */
function updateNodeInSnapshot(snapshotId, nodeId, patch) {
  const snap = snapshots.get(snapshotId);
  if (!snap) return;

  const nodes = snap.nodes || [];
  const idx   = nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) return;

  nodes[idx] = {
    ...nodes[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  snapshots.set(snapshotId, {
    ...snap,
    nodes,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * getNodeOutputs
 * Given a snapshotId and an array of node IDs,
 * returns the result objects of those nodes (for use in merge engine).
 * @param {string}   snapshotId
 * @param {string[]} nodeIds
 * @returns {Array}
 */
function getNodeOutputs(snapshotId, nodeIds) {
  const snap = snapshots.get(snapshotId);
  if (!snap) return [];
  return (snap.nodes || [])
    .filter(n => nodeIds.includes(n.id))
    .map(n => n.result);
}

module.exports = {
  saveSnapshot,
  loadSnapshot,
  updateNodeInSnapshot,
  getNodeOutputs,
  snapshots,
};
