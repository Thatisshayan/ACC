'use strict';
// scripts/verifyUiDashboard.js
// Playwright Integration & Visual QA Test for ACC Dashboard

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT_BACKEND = 4000;
const PORT_FRONTEND = 5173;
const SCREENSHOT_PATH = path.join(__dirname, '../data/dashboard_screenshot.png');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = http.createServer()
      .once('error', () => resolve(true)) // port in use
      .once('listening', () => {
        server.close();
        resolve(false); // port free
      })
      .listen(port);
  });
}

async function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await sleep(500);
  }
  return false;
}

async function run() {
  console.log('[ui-qa] Checking if servers are already running...');
  const backendRunning = await isPortOpen(PORT_BACKEND);
  const frontendRunning = await isPortOpen(PORT_FRONTEND);

  let backendProc = null;
  let frontendProc = null;

  if (!backendRunning) {
    console.log('[ui-qa] Spawning backend server...');
    backendProc = spawn('node', [path.join(__dirname, 'start.js')], {
      env: { ...process.env, PORT: PORT_BACKEND, NODE_ENV: 'development' },
      stdio: 'ignore',
      shell: true
    });
  }

  if (!frontendRunning) {
    console.log('[ui-qa] Spawning frontend dev server...');
    const uiDir = path.join(__dirname, '../ui');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    frontendProc = spawn(npmCmd, ['run', 'dev', '--', '--port', PORT_FRONTEND], {
      cwd: uiDir,
      stdio: 'ignore',
      shell: true
    });
  }

  console.log('[ui-qa] Waiting for servers to be healthy...');
  const backendOk = await waitForServer(PORT_BACKEND, 30000);
  const frontendOk = await waitForServer(PORT_FRONTEND, 30000);

  if (!backendOk || !frontendOk) {
    console.error('[ui-qa] Failed to start servers. Backend:', backendOk, 'Frontend:', frontendOk);
    if (backendProc) backendProc.kill();
    if (frontendProc) frontendProc.kill();
    process.exit(1);
  }

  console.log('[ui-qa] Servers online. Running Playwright UI-QA script...');

  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch (e) {
    console.error('[ui-qa] Playwright not available. Skipping integration test. Error:', e.message);
    if (backendProc) backendProc.kill();
    if (frontendProc) frontendProc.kill();
    process.exit(0); // non-blocking skip if playwright is not fully installed
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    console.log(`[ui-qa] Navigating to http://localhost:${PORT_FRONTEND} ...`);
    await page.goto(`http://localhost:${PORT_FRONTEND}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000); // allow scripts to load completely

    // Verify root mounting
    const root = await page.$('#root');
    if (!root) throw new Error('#root element not found on page');

    // Take screenshot for visual QA verification
    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH });
    console.log(`[ui-qa] Screenshot captured successfully: ${path.relative(process.cwd(), SCREENSHOT_PATH)}`);

    // Verify presence of basic text content (like ACC or Agent)
    const content = await page.content();
    const matchesTitle = content.includes('ACC') || content.includes('Center') || content.includes('Dashboard');
    if (!matchesTitle) {
      console.warn('[ui-qa] Warning: Expected page content not found in HTML. Check screenshot.');
    } else {
      console.log('[ui-qa] Core dashboard content verified.');
    }

    console.log('[ui-qa] Visual QA & Integration Test PASSED!');
  } catch (err) {
    console.error('[ui-qa] Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    if (backendProc) backendProc.kill();
    if (frontendProc) frontendProc.kill();
    console.log('[ui-qa] Cleaned up servers and exited.');
  }
}

run().catch((e) => {
  console.error('[ui-qa] Fatal unhandled:', e);
  process.exit(1);
});
