'use strict';
// cloud/integrations/flowise.js — Flowise experimental bridge

var axios = require('axios');
var BASE = process.env.FLOWISE_API_URL;
var KEY = process.env.FLOWISE_API_KEY;

if (!BASE) console.warn('[flowise] FLOWISE_API_URL not set — integration disabled');
if (!KEY) console.warn('[flowise] FLOWISE_API_KEY not set — integration disabled');

function enabled() {
  return !!(BASE && KEY);
}

function root() {
  return String(BASE).replace(/\/$/, '');
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'FLOWISE_API_URL or FLOWISE_API_KEY missing' };
  try {
    var headers = { Authorization: 'Bearer ' + KEY };
    var r = await axios.get(root() + '/api/v1/chatflows', {
      headers: headers,
      timeout: 8000,
      validateStatus: function (s) { return s < 500; },
    });
    if (r.status === 401) return { status: 'error', error: 'invalid API key' };
    return { status: 'connected', service: 'flowise' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { checkHealth, enabled };
