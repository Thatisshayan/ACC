'use strict';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const alphonsoBridge = require('./alphonsoBridge.js');

const TOKEN = 'test-bridge-token-123';

let rootDir;
let dataDir;
let app;

before(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-bridge-test-'));
});

after(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

function mountApp() {
  app = express();
  app.use(express.json());
  app.use('/api/alphonso-bridge', alphonsoBridge);
}

describe('alphonso bridge read-endpoint authz (Phase 1)', () => {
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(rootDir, 'case-'));
    process.env.ALPHONSO_BRIDGE_TOKEN = TOKEN;
    process.env.ALPHONSO_BRIDGE_DATA_DIR = dataDir;
    delete process.env.ACC_ALPHONSO_BRIDGE_TOKEN;
    delete process.env.ALPHONSO_BRIDGE_PATH_PREFIX;
    mountApp();
  });

  afterEach(() => {
    delete process.env.ALPHONSO_BRIDGE_TOKEN;
    delete process.env.ALPHONSO_BRIDGE_DATA_DIR;
    delete process.env.ACC_ALPHONSO_BRIDGE_TOKEN;
  });

  test('GET /packets without a token is rejected 401', async () => {
    const res = await request(app).get('/api/alphonso-bridge/packets');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.status, 'unauthorized');
    assert.equal(res.body.error, 'Invalid bridge token.');
    assert.equal(res.body.bridge.tokenConfigured, true);
  });

  test('GET /packets with a wrong token is rejected 401', async () => {
    const res = await request(app)
      .get('/api/alphonso-bridge/packets')
      .set('Authorization', 'Bearer wrong-token');
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'unauthorized');
  });

  test('GET /packets with the shared token returns packets', async () => {
    const res = await request(app)
      .get('/api/alphonso-bridge/packets')
      .set('Authorization', 'Bearer ' + TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.packets));
    assert.equal(typeof res.body.limit, 'number');
  });

  test('GET /status without a token is rejected 401', async () => {
    const res = await request(app).get('/api/alphonso-bridge/status');
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'unauthorized');
  });

  test('GET /status with the shared token reports status', async () => {
    const res = await request(app)
      .get('/api/alphonso-bridge/status')
      .set('Authorization', 'Bearer ' + TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.bridge.status, 'configured');
  });

  test('POST / continues to record packets with a valid token (regression)', async () => {
    const res = await request(app)
      .post('/api/alphonso-bridge')
      .set('Authorization', 'Bearer ' + TOKEN)
      .send({ kind: 'memory', summary: 'Phase 1 regression packet' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, 'recorded');
    assert.equal(res.body.kind, 'memory');
  });

  test('POST / with a bad token is still unauthorized (regression)', async () => {
    const res = await request(app)
      .post('/api/alphonso-bridge')
      .set('Authorization', 'Bearer not-the-token')
      .send({ kind: 'memory' });
    assert.equal(res.status, 401);
    assert.equal(res.body.status, 'unauthorized');
  });

  test('recorded packet is visible via authenticated GET /packets only', async () => {
    const unauth = await request(app).get('/api/alphonso-bridge/packets');
    assert.equal(unauth.status, 401);

    const post = await request(app)
      .post('/api/alphonso-bridge')
      .set('Authorization', 'Bearer ' + TOKEN)
      .send({ kind: 'memory', summary: 'authz-visibility check' });
    assert.equal(post.status, 200);

    const auth = await request(app)
      .get('/api/alphonso-bridge/packets')
      .set('Authorization', 'Bearer ' + TOKEN);
    assert.equal(auth.status, 200);
    assert.equal(auth.body.packets.length, 1);
    assert.equal(auth.body.packets[0].summary, 'authz-visibility check');
  });

  test('all bridge endpoints fail closed with setup_required when token is unset', async () => {
    delete process.env.ALPHONSO_BRIDGE_TOKEN;

    const getRes = await request(app).get('/api/alphonso-bridge/packets');
    assert.equal(getRes.status, 503);
    assert.equal(getRes.body.status, 'setup_required');

    const postRes = await request(app)
      .post('/api/alphonso-bridge')
      .set('Authorization', 'Bearer ' + TOKEN)
      .send({ kind: 'memory' });
    assert.equal(postRes.status, 503);
    assert.equal(postRes.body.status, 'setup_required');
  });
});
