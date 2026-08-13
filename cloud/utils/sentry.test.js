'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const sentry = require('./sentry.js');

// Build a fake Sentry client that records calls without any network access.
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
    scope,
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

function withEnv(env, fn) {
  const saved = { ...process.env };
  for (const k of Object.keys(env)) process.env[k] = env[k];
  return fn().finally(() => {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

describe('sentry wrapper — no DSN / not initialized', () => {
  test('initIfConfigured no-ops (returns false) when SENTRY_DSN is unset', () => {
    return withEnv({ SENTRY_DSN: '' }, async () => {
      delete require.cache[require.resolve('./sentry.js')];
      sentry.setSentryInstance(null);
      assert.equal(sentry.initIfConfigured(), false);
      assert.equal(sentry.isInitialized(), false);
    });
  });

  test('captureException/captureMessage are no-ops when not initialized', () => {
    sentry.setSentryInstance(null);
    assert.equal(sentry.captureException(new Error('boom')), false);
    assert.equal(sentry.captureMessage('msg'), false);
  });
});

describe('sentry wrapper — injected fake client', () => {
  let fake;
  beforeEach(() => {
    fake = makeFakeSentry();
    sentry.setSentryInstance(fake);
  });
  afterEach(() => {
    sentry.setSentryInstance(null);
  });

  test('captureException delegates with tags applied to the scope', () => {
    assert.equal(sentry.isInitialized(), true);
    const err = new Error('boom');
    assert.equal(sentry.captureException(err, { tags: { handler: 'safeRequire', module: 'email' } }), true);
    assert.equal(fake.calls.exceptions.length, 1);
    assert.equal(fake.calls.exceptions[0].error, err);
    assert.deepEqual(fake.calls.exceptions[0].scope.tags, { handler: 'safeRequire', module: 'email' });
  });

  test('captureMessage delegates', () => {
    assert.equal(sentry.captureMessage('module load failed', { tags: { handler: 'safeRequire' } }), true);
    assert.equal(fake.calls.messages.length, 1);
    assert.equal(fake.calls.messages[0].message, 'module load failed');
    assert.deepEqual(fake.calls.messages[0].scope.tags, { handler: 'safeRequire' });
  });

  test('flush delegates to the client and resolves', async () => {
    const result = await sentry.flush(2000);
    assert.equal(result, true);
    assert.deepEqual(fake.calls.flushes, [2000]);
  });

  test('captureException without tags still calls the client', () => {
    assert.equal(sentry.captureException(new Error('plain')), true);
    assert.equal(fake.calls.exceptions.length, 1);
    assert.deepEqual(fake.calls.exceptions[0].scope.tags, {});
  });
});
