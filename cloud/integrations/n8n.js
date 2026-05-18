'use strict';
// cloud/integrations/n8n.js — n8n webhook bridge

var WEBHOOK = process.env.N8N_WEBHOOK_URL;

if (!WEBHOOK) console.warn('[n8n] N8N_WEBHOOK_URL not set — integration disabled');

function enabled() {
  return !!WEBHOOK;
}

function urlValid() {
  try {
    var u = new URL(WEBHOOK);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'N8N_WEBHOOK_URL missing' };
  if (!urlValid()) return { status: 'error', error: 'N8N_WEBHOOK_URL format invalid' };
  return { status: 'configured', note: 'Webhook URL set; not invoked to avoid side effects' };
}

module.exports = { checkHealth, enabled };
