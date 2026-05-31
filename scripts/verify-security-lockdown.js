'use strict';

const { spawn } = require('child_process');
const fs = require('fs');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) return true;
    } catch (_) {}
    await sleep(250);
  }
  return false;
}

async function requestStatus(url, options = {}) {
  try {
    const r = await fetch(url, options);
    return r.status;
  } catch {
    return 'unreachable';
  }
}

async function requestWithHeaders(url, options = {}) {
  try {
    const r = await fetch(url, options);
    return {
      status: r.status,
      headers: {
        xFrameOptions: r.headers.get('x-frame-options'),
        xContentTypeOptions: r.headers.get('x-content-type-options'),
        referrerPolicy: r.headers.get('referrer-policy'),
        permissionsPolicy: r.headers.get('permissions-policy'),
        hsts: r.headers.get('strict-transport-security'),
      },
    };
  } catch {
    return { status: 'unreachable', headers: {} };
  }
}

function startServer(env) {
  const child = spawn(process.execPath, ['cloud/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

function pickBasePort() {
  const fromEnv = Number(process.env.VERIFY_BASE_PORT || 0);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  const seed = Math.floor(Math.random() * 2000);
  return 4200 + seed;
}

async function run() {
  const report = {
    ts: new Date().toISOString(),
    dev: {},
    prod: {},
    coverage: {},
    verdict: 'pending',
  };

  const basePort = pickBasePort();
  const devPort = basePort;
  const devKey = 'verify-op-key';
  const devBase = `http://127.0.0.1:${devPort}`;
  const devServer = startServer({
    PORT: String(devPort),
    NODE_ENV: 'development',
    ACC_OPERATOR_API_KEY: devKey,
    TELEGRAM_WEBHOOK_SECRET: 'tg-secret-verify',
  });
  try {
    const healthy = await waitForHealth(devBase, 15000);
    report.dev.health = healthy ? 200 : 'timeout';
    if (!healthy) throw new Error('Dev server did not become healthy');
    const devHealthHeaders = await requestWithHeaders(`${devBase}/api/health`);
    report.dev.securityHeaders = devHealthHeaders.headers;
    const configPublic = await fetch(`${devBase}/api/config/public`).then(async (r) => ({ status: r.status, body: await r.json() })).catch(() => ({ status: 'unreachable', body: null }));
    report.dev.configPublicStatus = configPublic.status;
    report.dev.configPublicShape = !!(configPublic.body && configPublic.body.success && configPublic.body.config);
    report.dev.nestedAppRoute = await requestStatus(`${devBase}/app/dashboard`);

    const authHeaders = { Authorization: `Bearer ${devKey}` };
    const nowTs = String(Date.now());
    report.dev.anonExecute = await requestStatus(`${devBase}/api/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentType: 'test' }),
    });
    report.dev.authExecute = await requestStatus(`${devBase}/api/execute`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ agentType: 'test' }),
    });
    report.dev.anonAdmin = await requestStatus(`${devBase}/api/admin/users`);
    report.dev.anonAdminModules = await requestStatus(`${devBase}/api/admin/modules`);
    const adminModulesAuth = await fetch(`${devBase}/api/admin/modules`, { headers: authHeaders })
      .then(async (r) => ({ status: r.status, body: await r.json() }))
      .catch(() => ({ status: 'unreachable', body: null }));
    report.dev.authAdminModules = adminModulesAuth.status;
    report.dev.authAdminModulesShape = !!(
      adminModulesAuth.body &&
      adminModulesAuth.body.success === true &&
      adminModulesAuth.body.modules &&
      typeof adminModulesAuth.body.modules === 'object'
    );
    report.dev.anonWaitlistPrune = await requestStatus(`${devBase}/api/admin/retention/waitlist-prune`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ olderThanDays: 90, dryRun: true }),
    });
    report.dev.anonTaskbus = await requestStatus(`${devBase}/api/taskbus/stats`);
    report.dev.anonHub = await requestStatus(`${devBase}/api/hub/status`);
    report.dev.anonAutonomy = await requestStatus(`${devBase}/api/autonomy/status`);
    report.dev.anonMessages = await requestStatus(`${devBase}/api/messages/status`);
    report.dev.anonAssistant = await requestStatus(`${devBase}/api/assistant/status`);
    report.dev.anonVoice = await requestStatus(`${devBase}/api/voice/status`);
    report.dev.anonVoiceTranscribe = await requestStatus(`${devBase}/api/voice/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio: 'ZmFrZQ==' }),
    });
    report.dev.authVoiceTranscribe = await requestStatus(`${devBase}/api/voice/transcribe`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    report.dev.authAssistantTranscribe = await requestStatus(`${devBase}/api/assistant/transcribe`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    report.dev.anonOutreach = await requestStatus(`${devBase}/api/outreach/status`);
    report.dev.anonSynapse = await requestStatus(`${devBase}/api/synapse/status`);
    report.dev.anonCard = await requestStatus(`${devBase}/api/card/pending`);
    report.dev.anonMemory = await requestStatus(`${devBase}/api/memory/stats`);
    report.dev.anonMemoryExport = await requestStatus(`${devBase}/api/memory/export?scope=global`);
    report.dev.anonMemoryDelete = await requestStatus(`${devBase}/api/memory/account-delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: 'global', confirm: true }),
    });
    report.dev.anonMemoryPrune = await requestStatus(`${devBase}/api/memory/retention/prune`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    report.dev.anonUi = await requestStatus(`${devBase}/api/ui/dashboard`);
    report.dev.anonStatus = await requestStatus(`${devBase}/api/status`);
    report.dev.anonWebhookInfo = await requestStatus(`${devBase}/api/webhook/telegram/info`);
    report.dev.anonDebug = await requestStatus(`${devBase}/api/debug`);
    report.dev.authDebug = await requestStatus(`${devBase}/api/debug`, { headers: authHeaders });
    report.dev.authBillingPlans = await requestStatus(`${devBase}/api/billing/plans`, { headers: authHeaders });
    report.dev.anonSetup = await requestStatus(`${devBase}/api/admin/setup`);
    report.dev.authSetup = await requestStatus(`${devBase}/api/admin/setup`, { headers: authHeaders });
    report.dev.approvalNoFreshness = await requestStatus(`${devBase}/api/snapshot/approve`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ snapshotId: 'fake', approve: true, approver: 'Shayan' }),
    });
    report.dev.approvalFreshness = await requestStatus(`${devBase}/api/snapshot/approve`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        'x-approval-timestamp': nowTs,
        'x-approval-nonce': 'nonce-verify-1',
      },
      body: JSON.stringify({ snapshotId: 'fake', approve: true }),
    });
    report.dev.phoneWebhookNoSig = await requestStatus(`${devBase}/api/phone/webhook/sms`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B10000000000&Body=hello&To=%2B19999999999',
    });
    report.dev.telegramWebhookNoSecret = await requestStatus(`${devBase}/api/webhook/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });
  } finally {
    devServer.kill('SIGTERM');
    await sleep(500);
  }

  const prodPort = basePort + 1;
  const prodBase = `http://127.0.0.1:${prodPort}`;
  const prodServer = startServer({
    PORT: String(prodPort),
    NODE_ENV: 'production',
    ACC_OPERATOR_API_KEY: 'prod-op-key',
    ACC_VAULT_MASTER_KEY: 'prod-vault-key',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
    TELEGRAM_WEBHOOK_SECRET: 'prod-tg-secret',
    STRIPE_WEBHOOK_SECRET: 'whsec_prod_test',
  });
  try {
    const healthy = await waitForHealth(prodBase, 15000);
    report.prod.health = healthy ? 200 : 'timeout';
    if (!healthy) throw new Error('Prod server did not become healthy');
    const prodHealthHeaders = await requestWithHeaders(`${prodBase}/api/health`);
    report.prod.securityHeaders = prodHealthHeaders.headers;

    report.prod.executeNoAuth = await requestStatus(`${prodBase}/api/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentType: 'test' }),
    });
    report.prod.telegramWebhookNoSecret = await requestStatus(`${prodBase}/api/webhook/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });
    report.prod.billingWebhookUnsigned = await requestStatus(`${prodBase}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'customer.subscription.updated', data: { object: {} } }),
    });
    report.prod.debug = await requestStatus(`${prodBase}/api/debug`);
    report.prod.setup = await requestStatus(`${prodBase}/api/admin/setup`);
    report.prod.billingPlans = await requestStatus(`${prodBase}/api/billing/plans`, {
      headers: { Authorization: 'Bearer prod-op-key' },
    });
  } finally {
    prodServer.kill('SIGTERM');
    await sleep(500);
  }

  const checks = [
    report.dev.anonExecute === 401,
    report.dev.configPublicStatus === 200,
    report.dev.configPublicShape === true,
    report.dev.nestedAppRoute === 200,
    report.dev.authExecute === 200,
    report.dev.anonAdmin === 401,
    report.dev.anonAdminModules === 401,
    report.dev.authAdminModules === 200,
    report.dev.authAdminModulesShape === true,
    report.dev.anonWaitlistPrune === 401,
    report.dev.anonTaskbus === 401,
    report.dev.anonHub === 401,
    report.dev.anonAutonomy === 401,
    report.dev.anonMessages === 401,
    report.dev.anonAssistant === 401,
    report.dev.anonVoice === 401,
    report.dev.anonVoiceTranscribe === 401,
    report.dev.authVoiceTranscribe === 400,
    report.dev.authAssistantTranscribe === 400,
    report.dev.anonOutreach === 401,
    report.dev.anonSynapse === 401,
    report.dev.anonCard === 401,
    report.dev.anonMemory === 401,
    report.dev.anonMemoryExport === 401,
    report.dev.anonMemoryDelete === 401,
    report.dev.anonMemoryPrune === 401,
    report.dev.anonUi === 401,
    report.dev.anonStatus === 401,
    report.dev.anonWebhookInfo === 401,
    report.dev.anonDebug === 401,
    report.dev.authDebug === 200,
    report.dev.authBillingPlans === 200,
    report.dev.anonSetup === 401,
    report.dev.authSetup === 200,
    report.dev.approvalNoFreshness === 400,
    report.dev.approvalFreshness === 404,
    (report.dev.phoneWebhookNoSig === 200 || report.dev.phoneWebhookNoSig === 401 || report.dev.phoneWebhookNoSig === 404),
    report.dev.telegramWebhookNoSecret === 401,
    report.prod.executeNoAuth === 401,
    report.prod.telegramWebhookNoSecret === 401,
    report.prod.billingWebhookUnsigned === 401,
    (report.prod.debug === 401 || report.prod.debug === 404),
    (report.prod.setup === 401 || report.prod.setup === 404),
    (report.prod.billingPlans === 401 || report.prod.billingPlans === 404),
    report.dev.securityHeaders.xFrameOptions === 'DENY',
    report.dev.securityHeaders.xContentTypeOptions === 'nosniff',
    report.dev.securityHeaders.referrerPolicy === 'no-referrer',
    typeof report.dev.securityHeaders.permissionsPolicy === 'string' && report.dev.securityHeaders.permissionsPolicy.length > 0,
    typeof report.prod.securityHeaders.hsts === 'string' && report.prod.securityHeaders.hsts.includes('max-age='),
  ];

  const landingAuthFiles = [
    'landing/login.html',
    'landing/auth-check.html',
  ];
  const hardcodedPatterns = [
    /sb_publishable_/i,
    /SUPABASE_URL\s*=\s*['"]https?:\/\//i,
    /SUPABASE_ANON\s*=\s*['"][^'"]+/i,
  ];
  const hardcodedHits = [];
  for (const relPath of landingAuthFiles) {
    const content = fs.readFileSync(relPath, 'utf8');
    for (const pattern of hardcodedPatterns) {
      if (pattern.test(content)) {
        hardcodedHits.push({ relPath, pattern: String(pattern) });
      }
    }
  }
  report.coverage.publicConfig = {
    filesChecked: landingAuthFiles.length,
    hardcodedHits,
  };
  checks.push(hardcodedHits.length === 0);

  report.coverage = {
    sensitiveRoutesChecked: 21,
    headerChecks: 5,
    publicConfigChecks: 1,
    expectationsPassed: checks.filter(Boolean).length,
    expectationsTotal: checks.length,
  };
  report.verdict = checks.every(Boolean) ? 'pass' : 'fail';
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'pass') process.exit(1);
}

run().catch((err) => {
  console.error('[verify-security-lockdown] failed:', err.message);
  process.exit(1);
});
