'use strict';
// cloud/integrations/grok.js — xAI Grok (OpenAI-compatible)

var axios = require('axios');

var BASE  = 'https://api.x.ai/v1';
var KEY   = process.env.GROK_API_KEY;
var MODEL = process.env.GROK_MODEL || 'grok-3';

var SEARCH_SYSTEM = 'You are a real-time social media and news analyst. Use your knowledge of current events.';

if (!KEY) console.warn('[grok] GROK_API_KEY not set — integration disabled');

function enabled() {
  return !!KEY;
}

function headers() {
  return { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'GROK_API_KEY missing' };
  try {
    var r = await axios.get(BASE + '/models', {
      headers: headers(),
      timeout: 8000,
      validateStatus: function(s) { return s < 500; },
    });
    if (r.status === 401 || r.status === 403) return { status: 'error', error: 'invalid API key' };
    return { status: 'connected', model: MODEL };
  } catch (e) {
    return { status: 'error', error: e.response ? e.response.status : e.message };
  }
}

async function chat(messages, opts) {
  if (!enabled()) return null;
  opts = opts || {};
  var msgs = Array.isArray(messages)
    ? messages
    : [{ role: 'user', content: String(messages || '') }];
  try {
    var r = await axios.post(BASE + '/chat/completions', {
      model: opts.model || MODEL,
      messages: msgs,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
      max_tokens: opts.max_tokens || 2000,
    }, { headers: headers(), timeout: opts.timeout || 60000 });
    var choice = r.data && r.data.choices && r.data.choices[0];
    var text = choice && choice.message && choice.message.content;
    return text ? String(text).trim() : null;
  } catch (e) {
    console.warn('[grok] chat failed:', e.response ? e.response.status : e.message);
    return null;
  }
}

async function search(query) {
  if (!query) return null;
  return chat([
    { role: 'system', content: SEARCH_SYSTEM },
    { role: 'user', content: String(query) },
  ]);
}

module.exports = { enabled, checkHealth, search, chat };
