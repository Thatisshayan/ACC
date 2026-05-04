// cloud/utils/campaignManager.js
// Opt-in checks, unsubscribe enforcement, batch quota tracking.

const optInList    = new Set();    // userId/email → opted in
const optOutList   = new Set();    // userId/email → unsubscribed
const batchCounts  = new Map();    // campaignId → { sent, approved }

/**
 * registerOptIn
 * @param {string} recipient
 */
function registerOptIn(recipient) {
  optInList.add(recipient);
  optOutList.delete(recipient);
}

/**
 * registerOptOut
 * @param {string} recipient
 */
function registerOptOut(recipient) {
  optOutList.add(recipient);
  optInList.delete(recipient);
}

/**
 * isOptedIn
 * @param {string} recipient
 * @returns {boolean}
 */
function isOptedIn(recipient) {
  return optInList.has(recipient) && !optOutList.has(recipient);
}

/**
 * filterEligibleRecipients
 * Removes opted-out recipients from a list.
 * @param {string[]} recipients
 * @returns {{ eligible: string[], blocked: string[] }}
 */
function filterEligibleRecipients(recipients) {
  const eligible = [];
  const blocked  = [];
  for (const r of recipients) {
    if (optOutList.has(r)) {
      blocked.push(r);
    } else {
      eligible.push(r);
    }
  }
  return { eligible, blocked };
}

/**
 * trackBatch
 * Records that a batch was sent for a campaign.
 * @param {string} campaignId
 * @param {number} count
 */
function trackBatch(campaignId, count = 1) {
  const current = batchCounts.get(campaignId) || { sent: 0, approved: 0 };
  current.sent += count;
  batchCounts.set(campaignId, current);
}

/**
 * markBatchApproved
 */
function markBatchApproved(campaignId) {
  const current = batchCounts.get(campaignId) || { sent: 0, approved: 0 };
  current.approved += 1;
  batchCounts.set(campaignId, current);
}

/**
 * getCampaignStats
 */
function getCampaignStats(campaignId) {
  return batchCounts.get(campaignId) || { sent: 0, approved: 0 };
}

/**
 * requiresOperatorApproval
 * Returns true if this campaign needs approval for the next batch
 * based on humanInLoop thresholds.
 *
 * @param {string} campaignId
 * @param {number} threshold - from acc.config.json humanInLoopThresholds
 * @returns {boolean}
 */
function requiresOperatorApproval(campaignId, threshold = 1) {
  const stats = getCampaignStats(campaignId);
  return stats.approved < threshold;
}

module.exports = {
  registerOptIn,
  registerOptOut,
  isOptedIn,
  filterEligibleRecipients,
  trackBatch,
  markBatchApproved,
  getCampaignStats,
  requiresOperatorApproval,
};
