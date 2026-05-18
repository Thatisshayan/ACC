'use strict';
// cloud/integrations/perplexity.js — Perplexity Sonar research API

var axios = require('axios');

var BASE  = 'https://api.perplexity.ai';
var KEY   = process.env.PERPLEXITY_API_KEY;
var MODEL = process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-large-128k-online';

if (!KEY) console.warn('[perplexity] PERPLEXITY_API_KEY not set — integration disabled');

function enabled() {
  return !!KEY;
}

function headers() {
  return { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
}

function normalizeCitations(data) {
  var urls = [];
  if (data && Array.isArray(data.citations)) {
    urls = data.citations.filter(Boolean).map(String);
  }
  if (data && Array.isArray(data.search_results)) {
    data.search_results.forEach(function(sr) {
      if (sr && sr.url && urls.indexOf(sr.url) === -1) urls.push(String(sr.url));
    });
  }
  return urls;
}

function formatWithCitations(text, citations) {
  if (!citations || !citations.length) return text;
  var lines = citations.map(function(url, i) { return (i + 1) + '. ' + url; });
  return text + '\n\n---\n**Sources:**\n' + lines.join('\n');
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'PERPLEXITY_API_KEY missing' };
  try {
    var r = await axios.post(BASE + '/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 16,
    }, {
      headers: headers(),
      timeout: 15000,
      validateStatus: function(s) { return s < 500; },
    });
    if (r.status === 401 || r.status === 403) return { status: 'error', error: 'invalid API key' };
    if (r.status >= 400) return { status: 'error', error: 'HTTP ' + r.status };
    return { status: 'connected', model: MODEL };
  } catch (e) {
    return { status: 'error', error: e.response ? e.response.status : e.message };
  }
}

async function research(query) {
  if (!enabled()) return { success: false, error: 'PERPLEXITY_API_KEY not set', text: null, citations: [] };
  if (!query) return { success: false, error: 'empty query', text: null, citations: [] };

  try {
    var r = await axios.post(BASE + '/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: String(query) }],
      temperature: 0.2,
      max_tokens: 4000,
    }, { headers: headers(), timeout: 90000 });

    var data = r.data || {};
    var choice = data.choices && data.choices[0];
    var text = choice && choice.message && choice.message.content;
    text = text ? String(text).trim() : '';
    var citations = normalizeCitations(data);

    if (!text) {
      return { success: false, error: 'empty response', text: null, citations: citations };
    }

    return {
      success: true,
      text: formatWithCitations(text, citations),
      citations: citations,
      model: data.model || MODEL,
    };
  } catch (e) {
    var err = e.response && e.response.data
      ? JSON.stringify(e.response.data).slice(0, 200)
      : e.message;
    console.warn('[perplexity] research failed:', err);
    return { success: false, error: err, text: null, citations: [] };
  }
}

module.exports = { enabled, checkHealth, research };
