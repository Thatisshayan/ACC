'use strict';
// cloud/integrations/helicone.js — Helicone AI analytics

var axios = require('axios');
var KEY = process.env.HELICONE_API_KEY;

if (!KEY) console.warn('[helicone] HELICONE_API_KEY not set — integration disabled');

function enabled() {
  return !!KEY;
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'HELICONE_API_KEY missing' };
  try {
    var r = await axios.get('https://api.helicone.ai/v1/request/query', {
      headers: { Authorization: 'Bearer ' + KEY },
      params: { limit: 1 },
      timeout: 8000,
      validateStatus: function (s) { return s < 500; },
    });
    if (r.status === 401 || r.status === 403) return { status: 'error', error: 'invalid API key' };
    return { status: 'connected', service: 'helicone' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { checkHealth, enabled };
