// cloud/roles/negotiationPolicy.js
// Stores and enforces negotiation rules for SalesBot and Agent roles.
// Policies loaded from LTM (Notion) or defaults below.

const DEFAULT_POLICY = {
  minPricePercent:    0.85,  // never go below 85% of listing price
  maxCounterRounds:   3,     // max back-and-forth rounds before escalating
  autoCounterPercent: 0.95,  // auto-counter at 95% of listing price
  requireApprovalBelow: 0.90, // flag for Operator if below 90%
  dailyMessageQuota:  50,    // max outbound messages per day per campaign
  requireOptIn:       true,  // all outreach must have opt-in token
};

let activePolicy = { ...DEFAULT_POLICY };

/**
 * loadPolicy
 * Override defaults from LTM or config.
 * @param {Object} overrides
 */
function loadPolicy(overrides = {}) {
  activePolicy = { ...DEFAULT_POLICY, ...overrides };
}

/**
 * getPolicy
 */
function getPolicy() {
  return { ...activePolicy };
}

/**
 * evaluateCounter
 * Given a listing price and buyer offer, decide auto-action.
 *
 * @param {number} listingPrice
 * @param {number} buyerOffer
 * @returns {{ action: "accept"|"counter"|"reject"|"escalate", counterPrice?: number, reason: string }}
 */
function evaluateCounter(listingPrice, buyerOffer) {
  const offerRatio = buyerOffer / listingPrice;

  if (offerRatio >= 1.0) {
    return { action: "accept", reason: "Offer meets or exceeds listing price." };
  }

  if (offerRatio >= activePolicy.autoCounterPercent) {
    return { action: "accept", reason: "Offer within auto-accept threshold." };
  }

  if (offerRatio >= activePolicy.requireApprovalBelow) {
    const counter = listingPrice * activePolicy.autoCounterPercent;
    return { action: "counter", counterPrice: Math.round(counter * 100) / 100, reason: "Auto-countering within policy." };
  }

  if (offerRatio >= activePolicy.minPricePercent) {
    return { action: "escalate", reason: "Offer below auto-counter threshold. Operator approval needed." };
  }

  return { action: "reject", reason: "Offer below minimum price floor. Rejecting." };
}

/**
 * checkDailyQuota
 * Returns true if under quota.
 * @param {number} sentToday
 */
function checkDailyQuota(sentToday) {
  return sentToday < activePolicy.dailyMessageQuota;
}

/**
 * validateOptIn
 * Returns true if opt-in token is present and valid.
 * @param {string|null} optInToken
 */
function validateOptIn(optInToken) {
  if (!activePolicy.requireOptIn) return true;
  return !!(optInToken && optInToken.length > 0);
}

module.exports = {
  loadPolicy,
  getPolicy,
  evaluateCounter,
  checkDailyQuota,
  validateOptIn,
  DEFAULT_POLICY,
};
