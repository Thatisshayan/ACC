'use strict';
// cloud/api/billingRoutes.test.js
//
// End-to-end regression test for the Stripe webhook path, mirroring the real
// mount order in cloud/server.js (the express.json() carve-out for
// /api/billing/webhook and the auth-gate exclusion) so this proves the two
// fixes that shipped together, not just the route handler in isolation.
//
// No network: the Stripe signature is generated locally via
// stripe.webhooks.generateTestHeaderString, and saveSubscription/loadSubscriptions
// no-op because no SUPABASE_* vars are set (see cloud/storage/supabaseMemory.js).

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const stripe = require('stripe')('sk_test_fake_key');

const billingRoutes = require('./billingRoutes.js');

const WEBHOOK_SECRET = 'whsec_test_secret_fixture_only';
const FAKE_EVENT = {
  id: 'evt_test_123',
  object: 'event',
  api_version: '2024-06-20',
  created: 1720000000,
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_test_123',
      object: 'subscription',
      customer: 'cus_test_123',
      status: 'active',
      metadata: { email: 'billing-test@example.com', plan: 'builder' },
    },
  },
};

// Real server.js mount order (see cloud/server.js):
//   1. Global body parsing that SKIPS /api/billing/webhook so the raw body
//      survives for Stripe signature verification.
//   2. app.use('/api/billing', authGate, billingRoutes) where the gate exempts
//      /webhook (Stripe never sends an Authorization header).
function buildAppWithCarveOut() {
  const app = express();
  app.use((req, res, next) => {
    if (req.path === '/api/billing/webhook') return next();
    return express.json()(req, res, next);
  });
  app.use('/api/billing', (req, res, next) => {
    if (req.path === '/webhook') return next();
    return require('../middleware/auth.js').requireOperatorOrAdmin(req, res, next);
  }, billingRoutes);
  return app;
}

// Negative control: WITHOUT the carve-out, express.json() parses the body first
// and signature verification must fail — proving the carve-out is load-bearing.
function buildAppWithoutCarveOut() {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', (req, res, next) => {
    if (req.path === '/webhook') return next();
    return require('../middleware/auth.js').requireOperatorOrAdmin(req, res, next);
  }, billingRoutes);
  return app;
}

// Current timestamp so Stripe's tolerance window (5 min) accepts it.
function signedHeader(payload) {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((k) => [k, process.env[k]]));
}
function restoreEnv(keys, snap) {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const AUTH_KEYS = ['ACC_OPERATOR_API_KEY', 'ACC_ADMIN_API_KEY', 'TASKBUS_API_KEY', 'STRIPE_API_KEY', 'STRIPE_WEBHOOK_SECRET', 'NODE_ENV'];
let envSnap;

describe('POST /api/billing/webhook (end-to-end, real signed payload)', () => {
  beforeEach(() => {
    envSnap = snapshotEnv(AUTH_KEYS);
    process.env.NODE_ENV = 'test';
    process.env.STRIPE_API_KEY = 'sk_test_fake_key';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    delete process.env.ACC_OPERATOR_API_KEY;
    delete process.env.ACC_ADMIN_API_KEY;
    delete process.env.TASKBUS_API_KEY;
  });
  afterEach(() => {
    restoreEnv(AUTH_KEYS, envSnap);
  });

  test('valid signature is accepted WITHOUT any Authorization header (auth-gate exclusion + JSON carve-out hold)', async () => {
    const payload = JSON.stringify(FAKE_EVENT);
    const res = await supertest(buildAppWithCarveOut())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signedHeader(payload))
      .send(payload);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true });

    // Observable end-to-end effect: the handler stored the subscription in the
    // in-memory store (readable via the exported getTier helper).
    assert.equal(billingRoutes.getTier('billing-test@example.com'), 'builder');
  });

  test('protected billing routes still require operator/admin auth (proves /webhook is genuinely exempt)', async () => {
    const res = await supertest(buildAppWithCarveOut())
      .get('/api/billing/subscription/billing-test@example.com');
    assert.equal(res.status, 401);
  });

  test('tampered payload (signature does not match body) is rejected with 400', async () => {
    const payload = JSON.stringify(FAKE_EVENT);
    const tampered = payload.replace('"active"', '"canceled"');
    const res = await supertest(buildAppWithCarveOut())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signedHeader(payload))
      .send(tampered);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Webhook signature failed/);
  });

  test('negative control: WITHOUT the JSON carve-out the same valid webhook fails', async () => {
    const payload = JSON.stringify(FAKE_EVENT);
    const res = await supertest(buildAppWithoutCarveOut())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signedHeader(payload))
      .send(payload);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Webhook signature failed/);
  });
});
