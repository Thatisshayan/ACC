'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const sentry = require('./sentry.js');
const { createErrorMiddleware } = require('./errorMiddleware.js');

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

function makeRes({ headersSent = false } = {}) {
  return {
    headersSent,
    _status: 200,
    _json: null,
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; },
  };
}

describe('Express error-handling middleware', () => {
  let fake;
  beforeEach(() => {
    fake = makeFakeSentry();
    sentry.setSentryInstance(fake);
  });
  afterEach(() => {
    sentry.setSentryInstance(null);
  });

  test('captures the error to Sentry and responds with a generic 500', () => {
    const mw = createErrorMiddleware();
    const err = new Error('boom');
    const req = {};
    const res = makeRes();
    let nextCalled = false;
    mw(err, req, res, () => { nextCalled = true; });

    assert.equal(fake.calls.exceptions.length, 1);
    assert.equal(fake.calls.exceptions[0].error, err);
    assert.deepEqual(fake.calls.exceptions[0].scope.tags, { handler: 'express-error-middleware' });
    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { success: false, error: 'Internal server error.' });
    assert.equal(nextCalled, false);
  });

  test('forwards to next() and does not respond when headers are already sent', () => {
    const mw = createErrorMiddleware();
    const err = new Error('late failure');
    const res = makeRes({ headersSent: true });
    let nextCalledWith = null;
    mw(err, {}, res, (e) => { nextCalledWith = e; });

    assert.equal(fake.calls.exceptions.length, 1, 'still reports to Sentry');
    assert.equal(nextCalledWith, err, 'error is forwarded so Express can close the connection');
    assert.equal(res._json, null, 'must not attempt a second response');
  });

  test('no-op when called without an error (calls next)', () => {
    const mw = createErrorMiddleware();
    const res = makeRes();
    let nextCalled = false;
    mw(undefined, {}, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(fake.calls.exceptions.length, 0);
  });
});
