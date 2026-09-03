'use strict';
// Regression coverage for the 2026-09-03 RCE/SSRF fixes (see docs/SECURITY_CODEEXEC.md).
// Run in a subprocess per test-file convention so CODEEXEC_ENABLED can be toggled
// without leaking into other test files' module cache.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

function freshCodeExec() {
  delete require.cache[require.resolve('./codeExec.js')];
  return require('./codeExec.js');
}

describe('codeExec kill switch', () => {
  let prevEnabled;
  beforeEach(() => { prevEnabled = process.env.CODEEXEC_ENABLED; });
  afterEach(() => { process.env.CODEEXEC_ENABLED = prevEnabled; });

  test('runJS/http/transform are disabled by default', async () => {
    delete process.env.CODEEXEC_ENABLED;
    const codeExec = freshCodeExec();
    const r1 = await codeExec.runCodeExecTask({ action: 'runJS', code: 'result = 1+1' });
    assert.equal(r1.success, false);
    assert.match(r1.error, /disabled/);

    const r2 = await codeExec.runCodeExecTask({ action: 'http', url: 'https://example.com' });
    assert.equal(r2.success, false);
    assert.match(r2.error, /disabled/);
  });

  test('CODEEXEC_ENABLED=true turns runJS back on', async () => {
    process.env.CODEEXEC_ENABLED = 'true';
    const codeExec = freshCodeExec();
    const r = await codeExec.runCodeExecTask({ action: 'runJS', code: 'result = 1+1' });
    assert.equal(r.success, true);
    assert.equal(r.output, 2);
  });
});

describe('codeExec SSRF guard (requires CODEEXEC_ENABLED=true)', () => {
  let codeExec;
  let prevEnabled;
  let prevAllowlist;

  beforeEach(() => {
    prevEnabled = process.env.CODEEXEC_ENABLED;
    prevAllowlist = process.env.CODEEXEC_HTTP_ALLOWLIST;
    process.env.CODEEXEC_ENABLED = 'true';
    delete process.env.CODEEXEC_HTTP_ALLOWLIST;
    codeExec = freshCodeExec();
  });
  afterEach(() => {
    process.env.CODEEXEC_ENABLED = prevEnabled;
    process.env.CODEEXEC_HTTP_ALLOWLIST = prevAllowlist;
  });

  test('isPrivateOrReservedIP classifies known ranges correctly', () => {
    assert.equal(codeExec.isPrivateOrReservedIP('169.254.169.254'), true); // cloud metadata
    assert.equal(codeExec.isPrivateOrReservedIP('127.0.0.1'), true);
    assert.equal(codeExec.isPrivateOrReservedIP('10.0.0.5'), true);
    assert.equal(codeExec.isPrivateOrReservedIP('172.16.0.1'), true);
    assert.equal(codeExec.isPrivateOrReservedIP('192.168.1.1'), true);
    assert.equal(codeExec.isPrivateOrReservedIP('::1'), true);
    assert.equal(codeExec.isPrivateOrReservedIP('8.8.8.8'), false);
    assert.equal(codeExec.isPrivateOrReservedIP('1.1.1.1'), false);
  });

  test('blocks a literal cloud-metadata IP URL', async () => {
    const r = await codeExec.httpRequest('GET', 'http://169.254.169.254/latest/meta-data/');
    assert.equal(r.success, false);
    assert.match(r.error, /blocked outbound request to private\/internal address/);
  });

  test('blocks a literal loopback IP URL', async () => {
    const r = await codeExec.httpRequest('GET', 'http://127.0.0.1:1/');
    assert.equal(r.success, false);
    assert.match(r.error, /blocked outbound request to private\/internal address/);
  });

  test('blocks a hostname that resolves to loopback (closes DNS rebinding at connect time)', async () => {
    const r = await codeExec.httpRequest('GET', 'http://localhost:1/');
    assert.equal(r.success, false);
    assert.match(r.error, /blocked outbound request to private\/internal address/);
  });

  test('rejects non-http(s) schemes', async () => {
    const r = await codeExec.httpRequest('GET', 'file:///etc/passwd');
    assert.equal(r.success, false);
    assert.match(r.error, /protocol/);
  });

  test('rejects invalid URLs', async () => {
    const r = await codeExec.httpRequest('GET', 'not a url');
    assert.equal(r.success, false);
    assert.match(r.error, /invalid URL/);
  });

  test('blocks decimal/octal/hex-obfuscated IP hosts (well-known SSRF filter-bypass elsewhere)', async () => {
    // The WHATWG URL parser normalizes all three forms to "127.0.0.1" before this
    // code ever sees a hostname, so they're caught by the same private-IP check as
    // any literal IP — this test exists to pin that behavior, not a separate guard.
    for (const url of ['http://2130706433/', 'http://0x7f000001/', 'http://017700000001/']) {
      const r = await codeExec.httpRequest('GET', url);
      assert.equal(r.success, false, url);
      assert.match(r.error, /blocked outbound request to private\/internal address \(127\.0\.0\.1\)/);
    }
  });

  test('honors an explicit host allowlist when set', async () => {
    process.env.CODEEXEC_HTTP_ALLOWLIST = 'example.com';
    const codeExecAllowlisted = freshCodeExec();
    const r = await codeExecAllowlisted.httpRequest('GET', 'https://example.org/');
    assert.equal(r.success, false);
    assert.match(r.error, /not on the allowlist/);
  });
});
