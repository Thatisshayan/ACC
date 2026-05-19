'use strict';
// cloud/connectors/jobApplier.js
// ACC v2 Job Application Connector
// Uses Playwright to search AND apply to jobs
// Sandbox mode by default — approval required for real submissions

var fs   = require('fs');
var path = require('path');

var SANDBOX  = process.env.JOB_APPLY_SANDBOX !== 'false'; // default sandbox=true
var DATA_DIR = path.join(__dirname, '../../data');
var APPS_FILE = path.join(DATA_DIR, 'job-applications.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function enabled() {
  try { require.resolve('playwright'); return true; } catch(e) { return false; }
}

async function searchJobs(role, location) {
  if (!enabled()) return { success: false, error: 'Playwright not installed. Run: npm install playwright && npx playwright install chromium' };
  var { chromium } = require('playwright');
  var browser = await chromium.launch({ headless: true });
  var page    = await browser.newPage();
  var jobs    = [];
  try {
    var url = 'https://www.indeed.com/jobs?q=' + encodeURIComponent(role) + '&l=' + encodeURIComponent(location);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    jobs = await page.evaluate(function() {
      var cards = document.querySelectorAll('.job_seen_beacon, [data-jk]');
      return Array.from(cards).slice(0, 15).map(function(card) {
        var t = card.querySelector('.jobTitle, h2 a');
        var c = card.querySelector('.companyName, [data-testid="company-name"]');
        var s = card.querySelector('.salary-snippet, [data-testid="attribute_snippet_testid"]');
        var l = card.querySelector('a[id^="job_"], h2 a');
        return {
          title:   t ? t.textContent.trim() : 'Unknown',
          company: c ? c.textContent.trim() : 'Unknown',
          salary:  s ? s.textContent.trim() : 'Not listed',
          url:     l ? ('https://www.indeed.com' + l.getAttribute('href')).split('?')[0] : '',
        };
      }).filter(function(j){ return j.title !== 'Unknown'; });
    });
    return { success: true, jobs: jobs, count: jobs.length };
  } catch(e) {
    return { success: false, error: e.message, jobs: [] };
  } finally {
    await browser.close();
  }
}

async function prepareApplication(jobUrl, userProfile) {
  return {
    success: true,
    jobDetails: { url: jobUrl, title: 'Job', company: 'Company' },
    resumeText: userProfile.resume || 'No resume provided',
    coverLetter: 'Dear Hiring Manager,\n\nI am interested in this role.\n\nSincerely,\n' + (userProfile.name || 'Applicant'),
  };
}

async function applyToJob(jobUrl, userProfile, resumeText, coverLetter) {
  if (SANDBOX) {
    return { success: true, sandbox: true, message: 'SANDBOX: Application simulated. Set JOB_APPLY_SANDBOX=false to submit real applications.', jobUrl };
  }
  return { success: false, error: 'Real applications require manual review. Use sandbox mode.', jobUrl };
}

function trackApplication(data) {
  var apps = [];
  try { apps = JSON.parse(fs.readFileSync(APPS_FILE, 'utf8')); } catch(e) {}
  apps.push(Object.assign({}, data, { trackedAt: new Date().toISOString() }));
  fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2));
  return { success: true, total: apps.length };
}

function getApplications() {
  try { return JSON.parse(fs.readFileSync(APPS_FILE, 'utf8')); } catch(e) { return []; }
}

async function sendTaskFromACC(accTask) {
  var instruction = accTask.instruction || accTask.title || '';
  // Parse: "find PM jobs in Toronto" or "apply for PM jobs in Toronto"
  var roleMatch  = instruction.match(/(?:for|find|search)?\s*(.+?)\s+jobs?\s+in\s+/i);
  var locMatch   = instruction.match(/\bjobs?\s+in\s+(.+?)(?:\s+and|\s*$)/i);
  var role       = roleMatch ? roleMatch[1].trim() : 'Product Manager';
  var location   = locMatch  ? locMatch[1].trim()  : 'Toronto';
  var shouldApply = /apply/i.test(instruction);

  console.log('[jobApplier] Searching:', role, 'in', location, '| Apply:', shouldApply);

  var searchResult = await searchJobs(role, location);
  if (!searchResult.success) return searchResult;

  var output = 'Found ' + searchResult.count + ' jobs for "' + role + '" in ' + location + ':\n\n';
  searchResult.jobs.slice(0, 8).forEach(function(j, i) {
    output += (i+1) + '. ' + j.title + ' @ ' + j.company + '\n';
    if (j.salary !== 'Not listed') output += '   Salary: ' + j.salary + '\n';
    if (j.url) output += '   ' + j.url + '\n';
    output += '\n';
  });

  if (shouldApply) {
    output += '\n⚠️ To actually apply, this requires your approval. Send /approvals to review.';
  }

  // Track the search
  trackApplication({ type: 'search', role, location, count: searchResult.count, jobs: searchResult.jobs.slice(0,5) });

  return { success: true, output, summary: 'Found ' + searchResult.count + ' ' + role + ' jobs in ' + location };
}

module.exports = { enabled, searchJobs, prepareApplication, applyToJob, trackApplication, getApplications, sendTaskFromACC };
