'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const sentry = require('./sentry.js');
const safeRequire = require('./safeRequire.js');

function makeFakeSentry() {
  const calls = { exceptions: [], messages: [], flushes: [] };
  const scope = {
    tags: {},
    extras: {},
    fingerprint: null,
    setTags(t) { Object.assign(this.tags, t); },
    setExtras(e) { Object.assign(this.extras, e); },
    setFingerprint(f) { this.fingerprint = f; },
  };
  const fake = {
    calls,
    withScope(cb) { cb(scope); },
    captureException(e) {
      calls.exceptions.push({ error: e, scope: { tags: { ...scope.tags }, extras: { ...scope.extras } } });
    },
    captureMessage(m) {
      calls.messages.push({ message: m, scope: { tags: { ...scope.tags }, extras: { ...scope.extras } } });
    },
    flush(ms) { calls.flushes.push(ms); return Promise.resolve(true); },
  };
  return fake;
}

describe('safeRequireWithName', () => {
  let fake;
  beforeEach(() => {
    fake = makeFakeSentry();
    sentry.setSentryInstance(fake);
  });
  afterEach(() => {
    sentry.setSentryInstance(null);
    for (const key of Object.keys(safeRequire.moduleLoadStatus)) {
      delete safeRequire.moduleLoadStatus[key];
    }
  });

  test('marks a successfully-loaded module and does not notify Sentry', () => {
    const mod = safeRequire.safeRequireWithName('./sentry.js', 'sentry');
    assert.ok(mod, 'module should load');
    assert.deepEqual(safeRequire.moduleLoadStatus.sentry, { loaded: true, error: null });
    assert.equal(fake.calls.exceptions.length, 0, 'no Sentry event for a healthy load');
  });

  test('marks a failed module, returns null, and captures to Sentry tagged with module name', () => {
    const mod = safeRequire.safeRequireWithName('./definitely-not-a-real-module-xyz.js', 'billing');
    assert.equal(mod, null);
    assert.equal(safeRequire.moduleLoadStatus.billing.loaded, false);
    assert.ok(safeRequire.moduleLoadStatus.billing.error, 'error message should be recorded');
    assert.equal(fake.calls.exceptions.length, 1);
    const captured = fake.calls.exceptions[0];
    assert.ok(captured.error instanceof Error);
    assert.deepEqual(captured.scope.tags, {
      handler: 'safeRequire',
      module: 'billing',
      mod: './definitely-not-a-real-module-xyz.js',
    });
  });

  test('safeRequire (single-arg) uses the module path as its name', () => {
    const mod = safeRequire.safeRequire('./definitely-not-a-real-module-xyz.js');
    assert.equal(mod, null);
    assert.equal(safeRequire.moduleLoadStatus['./definitely-not-a-real-module-xyz.js'].loaded, false);
    assert.equal(fake.calls.exceptions.length, 1);
  });
});
