'use strict';

const { bootstrapOutreachCrm } = require('./accOutreachCrmModule.js');

let timer = null;
let running = false;

function boolEnv(name, defaultVal) {
  const v = String(process.env[name] || '').toLowerCase().trim();
  if (!v) return defaultVal;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function intEnv(name, fallback) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function runOnce() {
  if (running) return;
  running = true;
  const requestId = 'lead-poller-' + Date.now();
  try {
    const result = await bootstrapOutreachCrm({
      requestId: requestId,
      sheetCsvUrl: process.env.GOOGLE_SHEETS_LEADS_CSV_URL || '',
      maxLeads: intEnv('LEAD_COLLECTOR_MAX_LEADS_PER_RUN', 100),
      minScore: intEnv('LEAD_COLLECTOR_MIN_SCORE', 40),
      onlyNew: true,
      sink: process.env.LEAD_COLLECTOR_SINK || 'clickup',
      clickupListId: process.env.CLICKUP_LEADS_LIST_ID || process.env.CLICKUP_LIST_ID || '',
      createdBy: 'scheduler'
    });
    const rc = result && result.receipt ? result.receipt : {};
    console.log('[lead-poller] run:', requestId,
      '| success:', !!result.success,
      '| loaded:', rc.leads_loaded || 0,
      '| qualified:', rc.leads_qualified || 0,
      '| tasks:', rc.tasks_created || 0,
      '| clickup_ok:', (rc.mirrored && rc.mirrored.clickup_ok) || 0);
    if (!result.success) {
      console.log('[lead-poller] error:', result.error || 'unknown');
    }
  } catch (e) {
    console.log('[lead-poller] exception:', e && e.message ? e.message : String(e));
  } finally {
    running = false;
  }
}

function startLeadCollectorPoller() {
  if (!boolEnv('LEAD_COLLECTOR_POLLER_ENABLED', false)) {
    console.log('[lead-poller] disabled (set LEAD_COLLECTOR_POLLER_ENABLED=true to enable)');
    return;
  }
  const intervalMs = intEnv('LEAD_COLLECTOR_POLL_INTERVAL_MS', 15 * 60 * 1000);
  if (timer) clearInterval(timer);
  console.log('[lead-poller] enabled | interval_ms:', intervalMs);
  runOnce().catch(function() {});
  timer = setInterval(function() { runOnce().catch(function() {}); }, intervalMs);
}

module.exports = {
  startLeadCollectorPoller,
  runLeadCollectorPollerOnce: runOnce
};
