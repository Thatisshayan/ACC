'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateOrReservedIP, assertPublicHttpUrl } = require('./ssrfGuard.js');

describe('ssrfGuard.isPrivateOrReservedIP', () => {
  test('classifies known private/reserved ranges', () => {
    assert.equal(isPrivateOrReservedIP('169.254.169.254'), true); // cloud metadata
    assert.equal(isPrivateOrReservedIP('127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIP('10.0.0.5'), true);
    assert.equal(isPrivateOrReservedIP('172.16.0.1'), true);
    assert.equal(isPrivateOrReservedIP('192.168.1.1'), true);
    assert.equal(isPrivateOrReservedIP('::1'), true);
    assert.equal(isPrivateOrReservedIP('8.8.8.8'), false);
    assert.equal(isPrivateOrReservedIP('1.1.1.1'), false);
  });
});

describe('ssrfGuard.assertPublicHttpUrl', () => {
  test('rejects a literal private IP', () => {
    assert.throws(() => assertPublicHttpUrl('http://169.254.169.254/'), /private\/internal address/);
  });
  test('rejects non-http(s) schemes', () => {
    assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'), /protocol/);
  });
  test('rejects invalid URLs', () => {
    assert.throws(() => assertPublicHttpUrl('not a url'), /invalid URL/);
  });
  test('allows a public URL', () => {
    assert.doesNotThrow(() => assertPublicHttpUrl('https://example.com/webhook'));
  });
  test('enforces an allowlist when given one', () => {
    assert.throws(
      () => assertPublicHttpUrl('https://example.org/', { allowlist: ['example.com'] }),
      /not on the allowlist/
    );
    assert.doesNotThrow(() => assertPublicHttpUrl('https://example.com/', { allowlist: ['example.com'] }));
  });
});
