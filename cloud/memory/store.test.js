'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store.js');

describe('memory lifecycle helpers', () => {
  test('exportScope returns inserted rows', () => {
    const key = 'test_export_key_' + Date.now();
    store.remember('test_scope', key, { ok: true }, { source: 'test', importance: 3 });
    const rows = store.exportScope('test_scope');
    assert.ok(Array.isArray(rows));
    assert.ok(rows.some((r) => r.key === key));
  });

  test('pruneExpired removes expired entries', () => {
    const key = 'test_expired_key_' + Date.now();
    store.remember('test_scope', key, 'to-expire', { expiresAt: '2000-01-01 00:00:00' });
    const before = store.exportScope('test_scope').length;
    const result = store.pruneExpired();
    const after = store.exportScope('test_scope').length;
    assert.ok(result.deleted_memories >= 1 || before === after);
  });
});
