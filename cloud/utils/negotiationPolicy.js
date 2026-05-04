// cloud/utils/negotiationPolicy.js
// Auto-counter logic, price thresholds, round limits.

const DEFAULT_NEGOTIATION_POLICY = {
  autoCounterEnabled:            true,
  minAcceptablePricePercent:     0.85,
  maxAutoCounters:               2,
  initialCounterStrategy:        "percent", // "percent" | "fixed"
  initialCounterValue:           0.90,      // 90% of asking
  escalationRole:                "Operator",
  requireApprovalForHighValue:   true,
  highValueThreshold:            500,       // currency units
};

/**
 * decideCounter
 * Given an offer and listing, returns the negotiation action.
 *
 * @param {number} offer   - buyer's offer
 * @param {Object} listing - { price, negotiationPolicy? }
 * @param {number} roundsSoFar - how many counters already made
 * @returns {{ action: "accept"|"counter"|"decline"|"escalate", price?: number, reason?: string }}
 */
function decideCounter(offer, listing, roundsSoFar = 0) {
  const policy = { ...DEFAULT_NEGOTIATION_POLICY, ...(listing.negotiationPolicy || {}) };
  const asking  = listing.price || listing.askingPrice || 0;

  if (!policy.autoCounterEnabled) {
    return { action: "escalate", reason: "Auto-counter disabled by policy." };
  }

  if (roundsSoFar >= policy.maxAutoCounters) {
    return { action: "escalate", reason: `Max auto-counters (${policy.maxAutoCounters}) reached.` };
  }

  if (policy.requireApprovalForHighValue && asking >= policy.highValueThreshold) {
    return { action: "escalate", reason: `High-value listing (≥ ${policy.highValueThreshold}). Requires ${policy.escalationRole} approval.` };
  }

  const minAccept   = asking * policy.minAcceptablePricePercent;
  const nextCounter = Math.max(minAccept, Math.round(asking * policy.initialCounterValue));

  if (offer >= minAccept) {
    return { action: "accept", price: offer, reason: "Offer meets minimum acceptable price." };
  }

  if (offer >= nextCounter) {
    return { action: "accept", price: offer, reason: "Offer meets counter threshold." };
  }

  return { action: "counter", price: nextCounter, reason: "Auto-counter per policy." };
}

module.exports = { decideCounter, DEFAULT_NEGOTIATION_POLICY };
