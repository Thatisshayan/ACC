'use strict';
// scripts/smokeTest.js — ACC v2 smoke test suite
// Run: node scripts/smokeTest.js [--prod]

const http  = require('http');
const https = require('https');

const BASE = process.argv.includes('--prod')
  ? 'https://acc-production-a26c.up.railway.app'
  : 'http://localhost:4000';

const IS_HTTPS = BASE.startsWith('https');

let passed = 0, failed = 0;

function req(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port: url.port || (IS_HTTPS ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    };
    const transport = IS_HTTPS ? https : http;
    const reqObj = transport.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    reqObj.on('error', e => resolve({ status: 0, body: e.message }));
    reqObj.on('timeout', () => { reqObj.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (body) reqObj.write(JSON.stringify(body));
    reqObj.end();
  });
}

async function test(label, fn) {
  try {
    const ok = await fn();
    if (ok) { console.log('  ✅', label); passed++; }
    else     { console.log('  ❌', label); failed++; }
  } catch (e) {
    console.log('  ❌', label, '—', e.message); failed++;
  }
}

async function run() {
  console.log(`\nACC v2 Smoke Tests — ${BASE}\n${'─'.repeat(50)}`);

  console.log('\n[ Core API ]');
  await test('GET /api/health → 200 + ok:true', async () => {
    const r = await req('GET', '/api/health');
    return r.status === 200 && r.body.ok === true;
  });
  await test('GET /api/status → 200', async () => {
    const r = await req('GET', '/api/status');
    return r.status === 200;
  });
  await test('GET /api/status/summary → 200', async () => {
    const r = await req('GET', '/api/status/summary');
    return r.status === 200;
  });

  console.log('\n[ UI Routes ]');
  await test('GET /api/ui/dashboard → 200 + success:true', async () => {
    const r = await req('GET', '/api/ui/dashboard');
    return r.status === 200 && r.body.success === true;
  });
  await test('GET /api/ui/approvals → 200', async () => {
    const r = await req('GET', '/api/ui/approvals');
    return r.status === 200;
  });
  await test('GET /api/ui/audit → 200', async () => {
    const r = await req('GET', '/api/ui/audit');
    return r.status === 200 && r.body.success === true;
  });
  await test('GET /api/ui/snapshots → 200', async () => {
    const r = await req('GET', '/api/ui/snapshots');
    return r.status === 200;
  });

  console.log('\n[ Admin ]');
  await test('GET /admin/system → 200', async () => {
    const r = await req('GET', '/admin/system');
    return r.status === 200;
  });
  await test('GET /admin/audit → 200', async () => {
    const r = await req('GET', '/admin/audit');
    return r.status === 200 && Array.isArray(r.body);
  });

  console.log('\n[ Task Bus ]');
  await test('GET /api/taskbus/tasks → 200', async () => {
    const r = await req('GET', '/api/taskbus/tasks');
    return r.status === 200;
  });

  console.log('\n[ Hub & Autonomy ]');
  await test('GET /api/hub/apps → 200', async () => {
    const r = await req('GET', '/api/hub/apps');
    return r.status === 200;
  });
  await test('GET /api/autonomy/loops → 200', async () => {
    const r = await req('GET', '/api/autonomy/loops');
    return r.status === 200 && r.body.success === true;
  });
  await test('GET /api/autonomy/stats → 200', async () => {
    const r = await req('GET', '/api/autonomy/stats');
    return r.status === 200;
  });

  console.log('\n[ Outreach ]');
  await test('GET /api/outreach/status → 200', async () => {
    const r = await req('GET', '/api/outreach/status');
    return r.status === 200 && r.body.success === true;
  });
  await test('GET /api/outreach/results → 200', async () => {
    const r = await req('GET', '/api/outreach/results');
    return r.status === 200 && r.body.success === true;
  });
  await test('POST /api/outreach/run missing body → 400', async () => {
    const r = await req('POST', '/api/outreach/run', {});
    return r.status === 400;
  });

  console.log('\n[ Messages ]');
  await test('GET /api/messages/status → 200', async () => {
    const r = await req('GET', '/api/messages/status');
    return r.status === 200;
  });

  console.log(`\n${'─'.repeat(50)}`);
  const total = passed + failed;
  const pct   = Math.round(passed / total * 100);
  const color = pct === 100 ? '🟢' : pct >= 70 ? '🟡' : '🔴';
  console.log(`${color} ${passed}/${total} passed (${pct}%)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
