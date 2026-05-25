'use strict';

// Lead collector background poller.
// Exports:
//   runLeadCollectorPollerOnce()  – single on-demand run (used by the API route)
//   startLeadCollectorPoller()    – sets up a recurring interval (used by start.js)

const { log } = require('../utils/logger.js');

const POLL_INTERVAL_MS = Number(process.env.LEAD_POLLER_INTERVAL_MS) || 5 * 60 * 1000; // 5 min default

let _pollerTimer = null;

async function runLeadCollectorPollerOnce() {
  log('[leadCollectorPoller] Running lead collector poll...');
  try {
    const outreachCrm = require('./accOutreachCrmModule.js');
    const result = await outreachCrm.bootstrapOutreachCrm({
      requestId: 'poller-' + Date.now(),
      sink: process.env.LEAD_POLLER_SINK || 'none',
      maxLeads: Number(process.env.LEAD_POLLER_MAX_LEADS) || 25,
      createdBy: 'poller',
      onlyNew: true,
    });
    log('[leadCollectorPoller] Poll complete. Leads qualified:', result.leads_qualified || 0);
    return result;
  } catch (err) {
    log('[leadCollectorPoller] Poll error:', err.message);
    return { success: false, error: err.message };
  }
}

function startLeadCollectorPoller() {
  if (_pollerTimer) return; // already running
  log('[leadCollectorPoller] Starting background poller (interval: ' + POLL_INTERVAL_MS + 'ms)');
  _pollerTimer = setInterval(function () {
    runLeadCollectorPollerOnce().catch(function (err) {
      log('[leadCollectorPoller] Interval error:', err.message);
    });
  }, POLL_INTERVAL_MS);
  if (_pollerTimer.unref) _pollerTimer.unref(); // do not prevent process exit
}

module.exports = {
  runLeadCollectorPollerOnce,
  startLeadCollectorPoller,
};
