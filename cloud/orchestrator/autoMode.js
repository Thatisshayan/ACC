// cloud/orchestrator/autoMode.js

const AUTO_MODES = {
  CONSERVATIVE: "conservative",
  BALANCED:     "balanced",
  AUTONOMOUS:   "autonomous",
};

/**
 * decideNextAction
 * Given the current graph state + autoMode, decide:
 * - should we continue automatically?
 * - or pause and return control to the user?
 *
 * @param {Object} params
 * @param {string} params.autoMode - one of AUTO_MODES values
 * @param {Array}  params.nodes    - full list of nodes with status
 * @returns {{ continueAutomatically: boolean }}
 */
function decideNextAction({ autoMode, nodes }) {
  const mode = autoMode || AUTO_MODES.BALANCED;

  const hasFailed  = nodes.some((n) => n.status === "failed");
  const hasPending = nodes.some((n) => n.status === "pending");
  const hasRunning = nodes.some((n) => n.status === "running");

  // If something failed, always stop and surface to user.
  if (hasFailed) {
    return { continueAutomatically: false };
  }

  // If nothing left to do, stop.
  if (!hasPending && !hasRunning) {
    return { continueAutomatically: false };
  }

  if (mode === AUTO_MODES.CONSERVATIVE) {
    // Run one node at a time, then pause.
    return { continueAutomatically: false };
  }

  if (mode === AUTO_MODES.BALANCED) {
    // Auto-run small graphs (≤3 pending), pause on larger fan-out.
    const pendingCount = nodes.filter((n) => n.status === "pending").length;
    if (pendingCount <= 3) {
      return { continueAutomatically: true };
    }
    return { continueAutomatically: false };
  }

  if (mode === AUTO_MODES.AUTONOMOUS) {
    // Run everything until graph completes or a failure occurs.
    return { continueAutomatically: true };
  }

  // Default fallback
  return { continueAutomatically: false };
}

module.exports = { AUTO_MODES, decideNextAction };
