'use strict';
// cloud/integrations/openrouter.js — OpenRouter AI gateway

var axios = require('axios');
var KEY = process.env.OPENROUTER_API_KEY;

if (!KEY) console.warn('[openrouter] OPENROUTER_API_KEY not set — integration disabled');

function enabled() {
  return !!KEY;
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'OPENROUTER_API_KEY missing' };
  try {
    var r = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: 'Bearer ' + KEY },
      timeout: 8000,
    });
    return { status: 'connected', models: (r.data && r.data.data && r.data.data.length) || 0 };
  } catch (e) {
    return { status: 'error', error: e.response ? e.response.status : e.message };
  }
}

module.exports = { checkHealth, enabled };
