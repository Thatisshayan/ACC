'use strict';
// cloud/integrations/qdrant.js — Qdrant vector memory

var axios = require('axios');
var URL = process.env.QDRANT_URL;
var KEY = process.env.QDRANT_API_KEY;

if (!URL) console.warn('[qdrant] QDRANT_URL not set — integration disabled');
if (!KEY) console.warn('[qdrant] QDRANT_API_KEY not set — integration disabled');

function enabled() {
  return !!(URL && KEY);
}

function base() {
  return String(URL).replace(/\/$/, '');
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'QDRANT_URL or QDRANT_API_KEY missing' };
  try {
    var r = await axios.get(base() + '/collections', {
      headers: { 'api-key': KEY },
      timeout: 8000,
    });
    return { status: 'connected', collections: (r.data && r.data.result && r.data.result.collections && r.data.result.collections.length) || 0 };
  } catch (e) {
    return { status: 'error', error: e.response ? e.response.status : e.message };
  }
}

module.exports = { checkHealth, enabled };
