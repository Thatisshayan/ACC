// cloud/connectors/browser.js — Playwright browser connector
// Replaces stub. Sandbox mode by default, live via BROWSER_SANDBOX=false
'use strict';

const { log } = require('../utils/logger.js');

var SANDBOX = process.env.BROWSER_SANDBOX !== 'false';

// Lazy-load playwright — only imported when a real browser action runs.
// This prevents playwright from blocking server startup or slow builds.
function getChromium() {
  try { return require('playwright').chromium; }
  catch (e) { throw new Error('playwright not available — run: npm install playwright && npx playwright install chromium'); }
}

async function withPage(fn) {
  const chromium = getChromium();
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

/**
 * fillForm — navigate to a URL and fill+submit a form
 * @param {string} url
 * @param {Array<{selector: string, value: string}>} fields
 * @param {string} submitSelector — CSS selector for submit button
 */
async function fillForm(url, fields, submitSelector) {
  if (SANDBOX) {
    log('[browser] SANDBOX fillForm:', url, fields.length, 'fields');
    return { success: true, sandbox: true, message: 'Form fill simulated. Set BROWSER_SANDBOX=false for live.' };
  }
  return withPage(async function(page) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    for (const field of fields) {
      try {
        await page.waitForSelector(field.selector, { timeout: 5000 });
        await page.fill(field.selector, field.value);
      } catch (e) {
        log('[browser] fillForm: could not fill', field.selector, e.message);
      }
    }
    if (submitSelector) {
      await page.waitForSelector(submitSelector, { timeout: 5000 });
      await page.click(submitSelector);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }
    const finalUrl = page.url();
    const title    = await page.title();
    return { success: true, sandbox: false, finalUrl, pageTitle: title };
  });
}

/**
 * navigateAndExtract — go to URL, extract structured data
 * @param {string} url
 * @param {Object} selectors — { key: 'css selector', ... }
 */
async function navigateAndExtract(url, selectors) {
  return withPage(async function(page) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const result = {};
    for (const [key, selector] of Object.entries(selectors)) {
      try {
        const elements = await page.$$(selector);
        result[key] = await Promise.all(elements.slice(0, 20).map(el => el.innerText().catch(() => '')));
        if (result[key].length === 1) result[key] = result[key][0];
      } catch (e) {
        result[key] = null;
      }
    }
    return { success: true, url, extracted: result };
  });
}

/**
 * clickAndWait — navigate to URL, click an element, return resulting page
 * @param {string} url
 * @param {string} selector
 */
async function clickAndWait(url, selector) {
  if (SANDBOX) {
    return { success: true, sandbox: true, message: 'Click simulated. Set BROWSER_SANDBOX=false for live.' };
  }
  return withPage(async function(page) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(selector, { timeout: 8000 });
    await page.click(selector);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    return { success: true, sandbox: false, finalUrl: page.url(), pageTitle: await page.title() };
  });
}

/**
 * runBrowserTask — unified entry point used by executor.js
 */
async function runBrowserTask(payload) {
  try {
    const action = payload?.action || 'webSearch';
    if (action === 'search' || action === 'webSearch')   return await webSearch(payload.query || payload.prompt || '');
    if (action === 'searchJobs')                          return await searchJobs(payload.query, payload.location, payload.type);
    if (action === 'screenshot')                          return await screenshot(payload.url);
    if (action === 'fillForm')                            return await fillForm(payload.url, payload.fields || [], payload.submitSelector);
    if (action === 'extract')                             return await navigateAndExtract(payload.url, payload.selectors || {});
    if (action === 'click')                               return await clickAndWait(payload.url, payload.selector);
    return { success: false, error: `Browser: unknown action "${action}". Valid: search, searchJobs, screenshot, fillForm, extract, click` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { searchJobs, webSearch, screenshot, fillForm, navigateAndExtract, clickAndWait, runBrowserTask, checkHealth, SANDBOX };
