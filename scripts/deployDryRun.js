'use strict';
// scripts/deployDryRun.js
//
// Real deploy-dry gate for the Railway target (replaces the old no-op
// `::notice` in scripts/verify.sh / verify.ps1). Proves the actual production
// entrypoint — `node scripts/start.js` — boots, answers /health, and loads
// every module cloud/server.js attempts to require.
//
//   Usage: node scripts/deployDryRun.js
//   Exit  : 0 on success, 1 on any failure (boot timeout, health != 200,
//           module load failure). Suitable for a CI status check.
//
// Hermeticity / no real network (REPO_RULES.md R24):
//   - Spawns the child with a controlled env, NOT the parent's: no real
//     secrets are inherited from the shell.
//   - All CRITICAL vars (cloud/config/validateEnv.js) are supplied as obvious
//     fixtures built by concatenation so they can never be mistaken for or
//     committed as real secrets.
//   - External-call-capable keys are force-emptied ('' wins over dotenv's
//     override:false) and SUPABASE_URL is pinned to a localhost-only address,
//     so even if a real .env leaks values into the child, nothing can phone
//     home. (dotenv.config() in scripts/start.js reads ../.env with
//     override:false — process.env already-set keys always win.)
//   - Telegram bot startup is skipped by the supervisor in start.js, and the
//     provider routers only attempt calls when an API key is set (none is).

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.DEPLOY_DRY_PORT || '4009';
const HEALTH_TIMEOUT_MS = Number(process.env.DEPLOY_DRY_HEALTH_TIMEOUT_MS || 60 * 1000);
const HEALTH_POLL_MS = 500;
// DEV NOTE: the handoff suggested ~15s, but cold boot on a dev machine is
// ~25-30s (AWS SDK require chain). Default 60s keeps CI sane and local runs
// honest; override with DEPLOY_DRY_HEALTH_TIMEOUT_MS.
const KILL_GRACE_MS = 5000;

const repoRoot = path.resolve(__dirname, '..');

// Non-optional modules: every safeRequire/safeRequireWithName target in
// cloud/server.js is a real file that the deployed app mounts when load
// succeeds. The twilio/openai bug class was exactly this — a require()'d file
// whose dependency chain silently failed to load. So this gate treats every
// entry in moduleLoadStatus as required: if the app could not load it, the
// gate fails. (If a module is later made genuinely optional, move its key here
// instead of deleting it.)
// Keys: email + loops use the module path as their name (single-arg safeRequire);
//       card, phone, billing, memory use their friendly names.
const REQUIRED_MODULES = [
  './api/emailRoutes.js',
  './api/loopsRoutes.js',
  'card',
  'phone',
  'billing',
  'memory',
];

function fixture(value) {
  return 'dry-' + value + '-fixture';
}

// Fake env for the child. Keep base passthrough minimal (no real secrets) but
// sufficient for Node/Windows native modules (os.tmpdir etc.).
const childEnv = {
  NODE_ENV: 'production',
  PORT,
  ACC_OPERATOR_API_KEY: fixture('operator'),
  ACC_VAULT_MASTER_KEY: fixture('vault-master'),
  SUPABASE_URL: 'http://127.0.0.1:59999',
  SUPABASE_SERVICE_ROLE_KEY: fixture('supabase-service-role'),
  SUPABASE_ANON_KEY: fixture('supabase-anon'),
  SUPABASE_KEY: fixture('supabase'),
  TELEGRAM_WEBHOOK_SECRET: fixture('telegram-webhook'),
  STRIPE_WEBHOOK_SECRET: fixture('stripe-webhook'),
  // Force-empty every key that, if present in a real .env, could trigger an
  // outbound provider call. '' wins because start.js uses override:false.
  ANTHROPIC_API_KEY: '',
  CLAUDE_API_KEY: '',
  OPENAI_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  GEMINI_API_KEY: '',
  TELEGRAM_BOT_TOKEN: '',
  STRIPE_API_KEY: '',
  RESEND_API_KEY: '',
  RUNWAY_API_KEY: '',
  PIKA_API_KEY: '',
  LUMA_API_KEY: '',
  ELEVEN_API_KEY: '',
  NETLIFY_API_KEY: '',
  GMAIL_CLIENT_ID: '',
  GMAIL_CLIENT_SECRET: '',
  SHOPIFY_API_KEY: '',
  HUNTER_API_KEY: '',
  PERPLEXITY_API_KEY: '',
};

for (const k of [
  'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'COMSPEC',
  'PATHEXT', 'OS', 'COMPUTERNAME', 'PROCESSOR_ARCHITECTURE',
  'APPDATA', 'LOCALAPPDATA', 'NUMBER_OF_PROCESSORS',
]) {
  if (process.env[k]) childEnv[k] = process.env[k];
}

function getJson(url, bearerToken) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: bearerToken ? { Authorization: 'Bearer ' + bearerToken } : {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { /* non-JSON body */ }
        resolve({ status: res.statusCode, body: parsed, raw: body.slice(0, 200) });
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(new Error('request timeout')); });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const { status, body } = await getJson(`http://127.0.0.1:${PORT}/health`);
      if (status === 200 && body && body.ok === true) return body;
      lastErr = new Error(`health returned ${status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(`app did not become healthy within ${HEALTH_TIMEOUT_MS}ms (last: ${lastErr ? lastErr.message : 'unknown'})`);
}

async function checkModules() {
  const { status, body } = await getJson(`http://127.0.0.1:${PORT}/api/admin/modules`, childEnv.ACC_OPERATOR_API_KEY);
  if (status !== 200) {
    throw new Error(`GET /api/admin/modules returned ${status} (expected 200)`);
  }
  const modules = (body && body.modules) || {};
  const missing = REQUIRED_MODULES.filter((name) => modules[name] === undefined);
  const failed = Object.entries(modules).filter(([, s]) => !(s && s.loaded === true));
  const loadedCount = Object.keys(modules).length;
  if (missing.length) {
    throw new Error(`required module statuses missing: ${missing.join(', ')}`);
  }
  if (failed.length) {
    throw new Error(`module(s) failed to load: ${failed.map(([k, s]) => `${k}: ${s.error}`).join(' | ')}`);
  }
  console.log(`[deployDry] /api/admin/modules OK — ${loadedCount} module(s) loaded, all required modules loaded:true`);
  return loadedCount;
}

function killGraceful(child) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      fin();
    }, KILL_GRACE_MS);
    child.once('exit', () => { clearTimeout(timer); fin(); });
    try { child.kill('SIGTERM'); } catch { fin(); }
  });
}

async function main() {
  console.log(`[deployDry] spawning: node scripts/start.js  PORT=${PORT}  NODE_ENV=production`);
  const child = spawn(process.execPath, ['scripts/start.js'], {
    cwd: repoRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });

  try {
    const health = await waitForHealth();
    console.log(`[deployDry] /health OK ->`, JSON.stringify(health));
    const loadedCount = await checkModules();
    console.log(`[deployDry] RESULT: PASS (${loadedCount} modules loaded, health OK)`);
  } catch (e) {
    console.error(`[deployDry] RESULT: FAIL — ${e.message}`);
    const tail = bootLog.split(/\r?\n/).slice(-25).join('\n');
    console.error(`[deployDry] ---- child log tail ----\n${tail}\n[deployDry] -------------------------`);
    process.exitCode = 1;
  } finally {
    await killGraceful(child);
  }
}

main().catch((e) => {
  console.error('[deployDry] unexpected error:', e && e.stack);
  process.exitCode = 1;
});
