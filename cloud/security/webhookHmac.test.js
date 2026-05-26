'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// Load middleware under test — no side effects at module load time.
const { requireTelegramSecret, requireHmacSignature } = require('./webhookHmac.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(headers = {}, body = null) {
  return { headers, body, ip: '127.0.0.1', path: '/test' };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body; return this; },
  };
  return res;
}

// ── requireTelegramSecret ─────────────────────────────────────────────────────

describe('requireTelegramSecret', () => {
  test('passes through when TELEGRAM_WEBHOOK_SECRET is not set', (t, done) => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const mw = requireTelegramSecret();
    const req = makeReq(); const res = makeRes();
    mw(req, res, () => { assert.equal(res._status, 200); done(); });
  });

  test('allows request with correct secret', (t, done) => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-abc';
    const mw = requireTelegramSecret();
    const req = makeReq({ 'x-telegram-bot-api-secret-token': 'test-secret-abc' });
    const res = makeRes();
    mw(req, res, () => { assert.equal(res._status, 200); done(); });
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  test('rejects request with wrong secret', (t, done) => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'correct-secret';
    const mw = requireTelegramSecret();
    const req = makeReq({ 'x-telegram-bot-api-secret-token': 'wrong-secret--' });
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; done(new Error('next() should not be called')); });
    // Give sync middleware time to run
    setImmediate(() => {
      if (!nextCalled) {
        assert.equal(res._status, 401);
        assert.equal(res._body && res._body.success, false);
        delete process.env.TELEGRAM_WEBHOOK_SECRET;
        done();
      }
    });
  });

  test('rejects request with missing header', (t, done) => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'correct-secret';
    const mw = requireTelegramSecret();
    const req = makeReq({});
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; done(new Error('next() should not be called')); });
    setImmediate(() => {
      if (!nextCalled) {
        assert.equal(res._status, 401);
        delete process.env.TELEGRAM_WEBHOOK_SECRET;
        done();
      }
    });
  });
});

// ── requireHmacSignature ──────────────────────────────────────────────────────

describe('requireHmacSignature', () => {
  const SECRET_VAR = 'TEST_HMAC_SECRET_' + Date.now();

  function validSig(secret, body) {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  test('passes through when secret env var is not set', (t, done) => {
    delete process.env[SECRET_VAR];
    const mw = requireHmacSignature({ secretEnvVar: SECRET_VAR });
    const req = makeReq({}, Buffer.from('hello'));
    const res = makeRes();
    mw(req, res, () => { assert.equal(res._status, 200); done(); });
  });

  test('accepts request with valid HMAC', (t, done) => {
    const secret = 'hmac-test-secret';
    process.env[SECRET_VAR] = secret;
    const body = Buffer.from('{"event":"push"}');
    const sig  = validSig(secret, body);
    const mw   = requireHmacSignature({ secretEnvVar: SECRET_VAR });
    const req  = makeReq({ 'x-hub-signature-256': sig }, body);
    const res  = makeRes();
    mw(req, res, () => {
      assert.equal(res._status, 200);
      assert.deepEqual(req.rawBody, body);
      delete process.env[SECRET_VAR];
      done();
    });
  });

  test('rejects request with tampered body', (t, done) => {
    const secret = 'hmac-test-secret';
    process.env[SECRET_VAR] = secret;
    const originalBody = Buffer.from('{"event":"push"}');
    const tamperedBody  = Buffer.from('{"event":"delete"}');
    const sig = validSig(secret, originalBody);
    const mw  = requireHmacSignature({ secretEnvVar: SECRET_VAR });
    const req = makeReq({ 'x-hub-signature-256': sig }, tamperedBody);
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; done(new Error('should not call next')); });
    setImmediate(() => {
      if (!nextCalled) {
        assert.equal(res._status, 401);
        delete process.env[SECRET_VAR];
        done();
      }
    });
  });

  test('returns 400 when body is not a Buffer', (t, done) => {
    const secret = 'hmac-test-secret';
    process.env[SECRET_VAR] = secret;
    const mw  = requireHmacSignature({ secretEnvVar: SECRET_VAR });
    const req = makeReq({ 'x-hub-signature-256': 'sha256=anything' }, '{"not":"a buffer"}');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; done(new Error('should not call next')); });
    setImmediate(() => {
      if (!nextCalled) {
        assert.equal(res._status, 400);
        delete process.env[SECRET_VAR];
        done();
      }
    });
  });

  test('accepts signature without sha256= prefix', (t, done) => {
    const secret = 'hmac-test-secret';
    process.env[SECRET_VAR] = secret;
    const body     = Buffer.from('data');
    const bareHex  = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const mw       = requireHmacSignature({ secretEnvVar: SECRET_VAR, prefix: '' });
    const req      = makeReq({ 'x-hub-signature-256': bareHex }, body);
    const res      = makeRes();
    mw(req, res, () => {
      assert.equal(res._status, 200);
      delete process.env[SECRET_VAR];
      done();
    });
  });
});
