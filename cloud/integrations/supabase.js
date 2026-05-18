'use strict';
// cloud/integrations/supabase.js — Supabase auth/db adapter

var axios = require('axios');
var URL = process.env.SUPABASE_URL;
var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL) console.warn('[supabase] SUPABASE_URL not set — integration disabled');
if (!KEY) console.warn('[supabase] SUPABASE_SERVICE_ROLE_KEY not set — integration disabled');

function enabled() {
  return !!(URL && KEY);
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' };
  try {
    var r = await axios.get(String(URL).replace(/\/$/, '') + '/rest/v1/', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      timeout: 8000,
      validateStatus: function (s) { return s < 500; },
    });
    if (r.status === 401) return { status: 'error', error: 'invalid service role key' };
    return { status: 'connected', service: 'supabase' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { checkHealth, enabled };
