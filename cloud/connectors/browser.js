// cloud/connectors/browser.js — Playwright browser connector
// Replaces stub. Sandbox mode by default, live via BROWSER_SANDBOX=false
'use strict';

const { chromium } = require('playwright');
const { log } = require('../utils/logger.js');

var SANDBOX = process.env.BROWSER_SANDBOX !== 'false';

async function withPage(fn) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
  })).newPage();
  try { return await fn(page); }
  finally { await browser.close(); }
}

async function searchJobs(query, location, type) {
  if (SANDBOX) {
    log('[browser] SANDBOX job search:', query, location);
    return {
      success: true, sandbox: true,
      jobs: [
        { title: '[SANDBOX] ' + query + ' — Senior', company: 'Demo Corp', location: location || 'Remote', url: 'https://ca.indeed.com', type: type || 'fulltime' },
        { title: '[SANDBOX] ' + query + ' — Mid-level', company: 'Acme Inc', location: location || 'Remote', url: 'https://ca.indeed.com', type: type || 'fulltime' },
        { title: '[SANDBOX] ' + query + ' — Contract', company: 'StartupXYZ', location: location || 'Remote', url: 'https://linkedin.com', type: type || 'contract' },
      ],
    };
  }
  log('[browser] Live job search:', query, location, type);
  return withPage(async function(page) {
    await page.goto(
      'https://ca.indeed.com/jobs?q=' + encodeURIComponent(query) + '&l=' + encodeURIComponent(location || ''),
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    var jobs = await page.evaluate(function() {
      return Array.from(document.querySelectorAll('[class*="resultContent"]')).slice(0, 10).map(function(c) {
        return {
          title:    ((c.querySelector('h2 a span') || c.querySelector('h2')) || {}).innerText || '',
          company:  (c.querySelector('[class*="companyName"]') || {}).innerText || '',
          location: (c.querySelector('[class*="companyLocation"]') || {}).innerText || '',
          url:      (c.querySelector('h2 a') || {}).href || '',
        };
      }).filter(function(j) { return j.title; });
    });
    return { success: true, sandbox: false, jobs: jobs, source: 'indeed' };
  });
}

async function webSearch(query) {
  if (SANDBOX) {
    log('[browser] SANDBOX web search:', query);
    return {
      success: true, sandbox: true,
      results: [{ title: '[SANDBOX] ' + query, url: 'https://duckduckgo.com', snippet: 'Set BROWSER_SANDBOX=false for live results' }],
    };
  }
  return withPage(async function(page) {
    await page.goto('https://duckduckgo.com/?q=' + encodeURIComponent(query), { waitUntil: 'domcontentloaded', timeout: 20000 });
    var results = await page.evaluate(function() {
      return Array.from(document.querySelectorAll('[data-testid="result"]')).slice(0, 8).map(function(r) {
        return {
          title:   (r.querySelector('h2') || {}).innerText || '',
          url:     (r.querySelector('a') || {}).href || '',
          snippet: (r.querySelector('[data-result="snippet"]') || {}).innerText || '',
        };
      });
    });
    return { success: true, sandbox: false, results: results, source: 'duckduckgo' };
  });
}

async function screenshot(url) {
  return withPage(async function(page) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    var buf = await page.screenshot({ type: 'png', fullPage: false });
    return { success: true, image: buf.toString('base64'), mimeType: 'image/png' };
  });
}

async function checkHealth() {
  try {
    const b = await chromium.launch({ headless: true });
    await b.close();
    return { status: 'ready', engine: 'playwright-chromium', sandbox: SANDBOX };
  } catch(e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { searchJobs, webSearch, screenshot, checkHealth, SANDBOX };
