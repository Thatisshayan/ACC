'use strict';
// cloud/integrations/langfuse.js — Langfuse tracing wrapper

var axios = require('axios');
var PUBLIC = process.env.LANGFUSE_PUBLIC_KEY;
var SECRET = process.env.LANGFUSE_SECRET_KEY;

if (!PUBLIC) console.warn('[langfuse] LANGFUSE_PUBLIC_KEY not set — integration disabled');
if (!SECRET) console.warn('[langfuse] LANGFUSE_SECRET_KEY not set — integration disabled');

function enabled() {
  return !!(PUBLIC && SECRET);
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY missing' };
  try {
    var r = await axios.get('https://cloud.langfuse.com/api/public/health', { timeout: 5000 });
    return { status: 'connected', service: 'langfuse' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { checkHealth, enabled };
