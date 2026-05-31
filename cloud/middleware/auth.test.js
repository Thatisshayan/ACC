'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  requireOperatorOrAdmin,
  requireServiceOperatorOrAdmin,
  requireApprovalFreshness,
} = require('./auth.js');

function makeReq(headers = {}, body = {}) {
  return { headers, body };
}

function makeRes() {
  return {
    _status: 200,
    _json: null,
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; },
  };
}

describe('auth middleware', () => {
  test('operator key can access operator/admin routes', () => {
    process.env.ACC_OPERATOR_API_KEY = 'op-key';
    delete process.env.ACC_ADMIN_API_KEY;
    delete process.env.TASKBUS_API_KEY;
    process.env.NODE_ENV = 'development';

    const req = makeReq({ authorization: 'Bearer op-key' });
    const res = makeRes();
    let nextCalled = false;
    requireOperatorOrAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.auth.role, 'operator');
  });

  test('service key denied on operator/admin-only routes', () => {
    delete process.env.ACC_OPERATOR_API_KEY;
    delete process.env.ACC_ADMIN_API_KEY;
    process.env.TASKBUS_API_KEY = 'svc-key';
    process.env.NODE_ENV = 'development';

    const req = makeReq({ authorization: 'Bearer svc-key' });
    const res = makeRes();
    let nextCalled = false;
    requireOperatorOrAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
  });

  test('service key allowed on service/operator/admin routes', () => {
    delete process.env.ACC_OPERATOR_API_KEY;
    delete process.env.ACC_ADMIN_API_KEY;
    process.env.TASKBUS_API_KEY = 'svc-key';
    process.env.NODE_ENV = 'development';

    const req = makeReq({ authorization: 'Bearer svc-key' });
    const res = makeRes();
    let nextCalled = false;
    requireServiceOperatorOrAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.auth.role, 'service');
  });

  test('production fails closed when no auth keys are configured', () => {
    delete process.env.ACC_OPERATOR_API_KEY;
    delete process.env.ACC_ADMIN_API_KEY;
    delete process.env.TASKBUS_API_KEY;
    process.env.NODE_ENV = 'production';

    const req = makeReq({});
    const res = makeRes();
    let nextCalled = false;
    requireOperatorOrAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 503);
  });
});

describe('approval freshness middleware', () => {
  test('accepts fresh timestamp + nonce', () => {
    const req = makeReq({ 'x-approval-timestamp': String(Date.now()), 'x-approval-nonce': 'nonce-1' }, {});
    const res = makeRes();
    let nextCalled = false;
    requireApprovalFreshness(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('rejects replay with same nonce+timestamp', () => {
    const ts = String(Date.now());
    const headers = { 'x-approval-timestamp': ts, 'x-approval-nonce': 'nonce-replay' };

    const req1 = makeReq(headers, {});
    const res1 = makeRes();
    requireApprovalFreshness(req1, res1, () => {});

    const req2 = makeReq(headers, {});
    const res2 = makeRes();
    let nextCalled = false;
    requireApprovalFreshness(req2, res2, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res2._status, 409);
  });
});
