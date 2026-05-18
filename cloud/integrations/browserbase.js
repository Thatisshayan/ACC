'use strict';
// cloud/integrations/browserbase.js — Browserbase cloud browser

var axios = require('axios');
var KEY = process.env.BROWSERBASE_API_KEY;
var PROJECT = process.env.BROWSERBASE_PROJECT_ID;

if (!KEY) console.warn('[browserbase] BROWSERBASE_API_KEY not set — integration disabled');
if (!PROJECT) console.warn('[browserbase] BROWSERBASE_PROJECT_ID not set — integration disabled');

function enabled() {
  return !!(KEY && PROJECT);
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID missing' };
  try {
    var r = await axios.get('https://www.browserbase.com/v1/sessions', {
      headers: { 'x-bb-api-key': KEY },
      params: { projectId: PROJECT, limit: 1 },
      timeout: 8000,
      validateStatus: function (s) { return s < 500; },
    });
    if (r.status === 401 || r.status === 403) return { status: 'error', error: 'invalid API key or project' };
    return { status: 'connected', service: 'browserbase' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { checkHealth, enabled };
