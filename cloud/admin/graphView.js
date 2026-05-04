// cloud/admin/graphView.js
const { snapshots } = require("../orchestrator/snapshots.js");

/**
 * getGraphView
 * Returns a simplified view of a snapshot for dashboard rendering.
 * @param {string} snapshotId
 * @returns {Object|null}
 */
function getGraphView(snapshotId) {
  const snap = snapshots.get(snapshotId);
  if (!snap) return null;

  return {
    snapshotId,
    meta:  snap.meta,
    nodes: (snap.nodes || []).map((n) => ({
      id:        n.id,
      agentType: n.agentType,
      status:    n.status,
      dependsOn: n.dependsOn || [],
      error:     n.error || null,
      updatedAt: n.updatedAt,
    })),
  };
}

/**
 * getAllGraphViews
 * Returns simplified views of all snapshots.
 */
function getAllGraphViews() {
  return [...snapshots.keys()].map(getGraphView).filter(Boolean);
}

module.exports = { getGraphView, getAllGraphViews };
