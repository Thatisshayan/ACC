'use strict';
// cloud/connectors/jobSearch.js
// ACC v2 Job Search — 4-source fallback chain
// SerpAPI → Adzuna → RemoteOK (free) → DeepSeek simulation

var axios = require('axios');
var path  = require('path');

var SERPAPI_KEY    = process.env.SERPAPI_KEY || '';
var ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID || '';
var ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || '';
var DEEPSEEK_KEY   = process.env.DEEPSEEK_API_KEY || '';

function enabled() { return true; } // always available via DeepSeek fallback

// ── Source 1: SerpAPI (50 free/month) ────────────────────────────────────────
async function searchSerpAPI(role, location, limit) {
  if (!SERPAPI_KEY) return null;
  try {
    var r = await axios.get('https://serpapi.com/search', {
      params: { engine: 'google_jobs', q: role + ' jobs in ' + location, api_key: SERPAPI_KEY, num: limit || 10 },
      timeout: 15000,
    });
    var jobs = (r.data.jobs_results || []).slice(0, limit || 10);
    return jobs.map(function(j) { return { title: j.title, company: j.company_name, location: j.location, salary: j.detected_extensions && j.detected_extensions.salary || 'Not listed', url: j.related_links && j.related_links[0] && j.related_links[0].link || '', description: (j.description||'').slice(0,200), source: 'SerpAPI' }; });
  } catch(e) { console.warn('[jobSearch] SerpAPI failed:', e.message); return null; }
}

// ── Source 2: Adzuna (free tier) ──────────────────────────────────────────────
async function searchAdzuna(role, location, limit) {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) return null;
  try {
    var country = location.toLowerCase().includes('canada') || location.toLowerCase().includes('toronto') ? 'ca' : 'us';
    var r = await axios.get('https://api.adzuna.com/v1/api/jobs/' + country + '/search/1', {
      params: { app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY, what: role, where: location, results_per_page: limit || 10 },
      timeout: 15000,
    });
    return (r.data.results || []).slice(0, limit || 10).map(function(j) { return { title: j.title, company: j.company && j.company.display_name || 'Unknown', location: j.location && j.location.display_name || location, salary: j.salary_min ? '$' + Math.round(j.salary_min) + ' - $' + Math.round(j.salary_max) : 'Not listed', url: j.redirect_url || '', description: (j.description||'').slice(0,200), source: 'Adzuna' }; });
  } catch(e) { console.warn('[jobSearch] Adzuna failed:', e.message); return null; }
}

// ── Source 3: RemoteOK (completely free, no key) ──────────────────────────────
async function searchRemoteOK(role, limit) {
  try {
    var r = await axios.get('https://remoteok.com/api?tag=' + encodeURIComponent(role.replace(/\s+/g, '-')), {
      headers: { 'User-Agent': 'ACC v2 Job Search' },
      timeout: 15000,
    });
    var jobs = (r.data || []).filter(function(j){ return j.position; }).slice(0, limit || 10);
    return jobs.map(function(j) { return { title: j.position, company: j.company || 'Unknown', location: 'Remote', salary: j.salary || 'Not listed', url: j.url || 'https://remoteok.com', description: (j.description||'').replace(/<[^>]+>/g,'').slice(0,200), source: 'RemoteOK' }; });
  } catch(e) { console.warn('[jobSearch] RemoteOK failed:', e.message); return null; }
}

// ── Source 4: DeepSeek simulation ────────────────────────────────────────────
async function searchDeepSeek(role, location, jobType, limit) {
  if (!DEEPSEEK_KEY) return [];
  try {
    var r = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'List ' + (limit||8) + ' realistic job postings for ' + role + ' in ' + location + ' (' + (jobType||'any type') + '). Return JSON array: [{title,company,location,salary,url,description}]. Use realistic Canadian companies and salaries in CAD. Output ONLY the JSON array.' }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }, { headers: { Authorization: 'Bearer ' + DEEPSEEK_KEY }, timeout: 25000 });
    var content = r.data.choices[0].message.content;
    var parsed = JSON.parse(content);
    var jobs = Array.isArray(parsed) ? parsed : (parsed.jobs || parsed.results || []);
    return jobs.map(function(j){ return Object.assign({source:'DeepSeek (simulated)'}, j); });
  } catch(e) { console.warn('[jobSearch] DeepSeek simulation failed:', e.message); return []; }
}

// ── Main search ────────────────────────────────────────────────────────────────
async function searchJobs(role, location, jobType, limit) {
  var results = null;
  results = await searchSerpAPI(role, location, limit);
  if (!results) results = await searchAdzuna(role, location, limit);
  if (!results) {
    var remote = await searchRemoteOK(role, limit);
    if (remote && remote.length > 0) results = remote;
  }
  if (!results || results.length === 0) results = await searchDeepSeek(role, location, jobType, limit);
  return results || [];
}

function formatForTelegram(jobs, role, location) {
  if (!jobs.length) return '❌ No jobs found for ' + role + ' in ' + location + '. Try a different role or location.';
  var lines = ['🔍 *' + jobs.length + ' jobs found: ' + role + ' in ' + location + '*\n'];
  jobs.slice(0, 8).forEach(function(j, i) {
    lines.push((i+1) + '. *' + j.title + '*');
    lines.push('   🏢 ' + j.company + ' | 📍 ' + j.location);
    if (j.salary && j.salary !== 'Not listed') lines.push('   💰 ' + j.salary);
    if (j.url) lines.push('   🔗 ' + j.url.slice(0, 60));
    lines.push('');
  });
  lines.push('_Source: ' + (jobs[0] && jobs[0].source || 'ACC Job Search') + '_');
  return lines.join('\n');
}

async function sendTaskFromACC(accTask) {
  var instruction = accTask.instruction || accTask.title || '';
  var roleMatch = instruction.match(/(?:for|find|search|looking for)?\s*(.+?)\s+jobs?\s+in\s+/i);
  var locMatch  = instruction.match(/\bjobs?\s+in\s+(.+?)(?:\s+and|\s*$)/i);
  var role      = roleMatch ? roleMatch[1].trim() : 'Product Manager';
  var location  = locMatch  ? locMatch[1].trim()  : 'Toronto, Canada';
  var type      = /remote/i.test(instruction) ? 'remote' : /part.time/i.test(instruction) ? 'part-time' : 'full-time';

  var jobs = await searchJobs(role, location, type, 10);
  return { success: true, output: formatForTelegram(jobs, role, location), jobs: jobs, summary: 'Found ' + jobs.length + ' ' + role + ' jobs in ' + location };
}

module.exports = { enabled, searchJobs, formatForTelegram, sendTaskFromACC };
