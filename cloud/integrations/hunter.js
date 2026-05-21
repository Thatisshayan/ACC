'use strict';
// cloud/integrations/hunter.js
// Hunter.io — email finder, verifier, domain search
// Use cases: find hiring manager emails, verify before applying, outreach

var axios = require('axios');
var KEY   = process.env.HUNTER_API_KEY || '';
var DKEY  = process.env.HUNTER_DISCOVER_API_KEY || KEY;
var BASE  = 'https://api.hunter.io/v2';

if (!KEY) console.warn('[hunter] HUNTER_API_KEY not set. Get at: hunter.io/api');

function enabled() { return !!KEY; }

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'Set HUNTER_API_KEY. Get at hunter.io/api' };
  try {
    var r = await axios.get(BASE + '/account', { params: { api_key: KEY }, timeout: 8000 });
    return { status: 'connected', plan: r.data.data && r.data.data.plan_name, requests_left: r.data.data && r.data.data.requests && r.data.data.requests.searches && r.data.data.requests.searches.available };
  } catch(e) { return { status: 'error', error: e.response ? e.response.status : e.message }; }
}

async function findEmail(domain, firstName, lastName) {
  if (!enabled()) return { success: false, error: 'HUNTER_API_KEY not set' };
  try {
    var r = await axios.get(BASE + '/email-finder', { params: { domain, first_name: firstName, last_name: lastName, api_key: KEY }, timeout: 10000 });
    var d = r.data.data;
    return { success: true, email: d.email, score: d.score, name: d.first_name + ' ' + d.last_name, company: domain };
  } catch(e) { return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message }; }
}

async function verifyEmail(email) {
  if (!enabled()) return { success: false, error: 'HUNTER_API_KEY not set' };
  try {
    var r = await axios.get(BASE + '/email-verifier', { params: { email: email, api_key: KEY }, timeout: 10000 });
    var d = r.data.data;
    return { success: true, result: d.result, score: d.score, email: email };
  } catch(e) { return { success: false, error: e.message }; }
}

async function domainSearch(domain, limit) {
  if (!enabled()) return { success: false, error: 'HUNTER_API_KEY not set' };
  try {
    var r = await axios.get(BASE + '/domain-search', { params: { domain, api_key: KEY, limit: limit || 10 }, timeout: 10000 });
    var emails = (r.data.data && r.data.data.emails) || [];
    return { success: true, emails: emails.map(function(e){ return { email: e.value, name: (e.first_name||'') + ' ' + (e.last_name||''), position: e.position, confidence: e.confidence }; }), total: r.data.data && r.data.data.total };
  } catch(e) { return { success: false, error: e.message }; }
}

async function sendTaskFromACC(accTask) {
  if (!enabled()) return { success: false, error: 'HUNTER_API_KEY not set. Get at hunter.io/api' };
  var instruction = (accTask.instruction || accTask.title || '').toLowerCase();
  // Parse: "find email for John Smith at microsoft.com"
  var findMatch = instruction.match(/find email.*?for\s+(.+?)\s+at\s+([\w.-]+)/i) || instruction.match(/email.*?([\w.]+@[\w.]+)/i);
  var verifyMatch = instruction.match(/verify\s+([\w.@+-]+)/i);
  var searchMatch = instruction.match(/search.*?(?:emails?\s+at|at)\s+([\w.-]+)/i);
  if (verifyMatch) {
    var v = await verifyEmail(verifyMatch[1]);
    return { success: v.success, output: v.success ? 'Email ' + v.email + ': ' + v.result + ' (score: ' + v.score + ')' : v.error };
  }
  if (searchMatch) {
    var s = await domainSearch(searchMatch[1]);
    var out = s.success ? 'Found ' + (s.emails||[]).length + ' emails at ' + searchMatch[1] + ':\n' + (s.emails||[]).slice(0,5).map(function(e){ return '• ' + e.email + (e.name.trim() ? ' (' + e.name.trim() + ')' : '') + (e.position ? ' — ' + e.position : ''); }).join('\n') : s.error;
    return { success: s.success, output: out };
  }
  // Default: domain search from instruction
  var domainGuess = instruction.match(/([\w-]+\.[a-z]{2,})/);
  if (domainGuess) {
    var ds = await domainSearch(domainGuess[1], 5);
    return { success: ds.success, output: ds.success ? 'Emails at ' + domainGuess[1] + ':\n' + ds.emails.slice(0,5).map(function(e){ return '• ' + e.email; }).join('\n') : ds.error };
  }
  return { success: false, error: 'Could not parse instruction. Use: "find email for Name at domain.com" or "search emails at company.com"' };
}

module.exports = { enabled, checkHealth, findEmail, verifyEmail, domainSearch, sendTaskFromACC };
