'use strict';
// cloud/hub/routes.test.js — /api/hub API surface (registry + memory + events/commands).

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const hubRoutes = require('./routes.js');
const memory = require('../memory/store.js');
const events = require('./events.js');
const commands = require('./commands.js');

let app;
let memMap;

function mount() {
  app = express();
  app.use(express.json());
  app.use('/api/hub', hubRoutes);
}

beforeEach(() => {
  memMap = new Map();
  mock.method(memory, 'remember', (scope, key, value) => { memMap.set(scope + ':' + key, value); return value; });
  mock.method(memory, 'recall', (scope, key) => memMap.get(scope + ':' + key) || null);
  mock.method(memory, 'recallAll', (scope) =>
    [...memMap.entries()].filter(([k]) => k.startsWith(scope + ':'))
      .map(([k, v]) => ({ key: k.slice(scope.length + 1), value: v })));
  mock.method(memory, 'search', (q) =>
    [...memMap.entries()].filter(([k]) => k.includes(String(q)))
      .map(([k, v]) => ({ key: k.split(':').slice(1).join(':'), value: v })));
  mock.method(memory, 'forget', (scope, key) => memMap.delete(scope + ':' + key));
  mock.method(memory, 'stats', () => ({ total: memMap.size }));
  mock.method(memory, 'getEvents', () => []);
  mock.method(events, 'processEvent', async (body) => ({ success: true, processed: body && body.appId }));
  mock.method(commands, 'sendCommand', async (appId, command) => ({ success: true, appId, command }));
  mock.method(commands, 'broadcast', async (capability, command) => ({ success: true, capability, count: 2 }));
  mount();
});

afterEach(() => { mock.restoreAll(); });

describe('hub routes (Phase 3)', () => {
  test('register app returns record with defaults', async () => {
    const res = await request(app).post('/api/hub/register').send({ id: 'app-1', name: 'Test App', capabilities: ['search'] });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.app.id, 'app-1');
    assert.equal(res.body.app.status, 'online');
    assert.equal(res.body.app.type, 'custom');
  });

  test('register without id/name is rejected 400', async () => {
    const res = await request(app).post('/api/hub/register').send({ name: 'MissingId' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('heartbeat returns true for known app, false for unknown', async () => {
    await request(app).post('/api/hub/register').send({ id: 'app-1', name: 'A' });
    const known = await request(app).post('/api/hub/heartbeat').send({ appId: 'app-1' });
    assert.equal(known.status, 200);
    assert.equal(known.body.success, true);
    const unknown = await request(app).post('/api/hub/heartbeat').send({ appId: 'nope' });
    assert.equal(unknown.body.success, false);
  });

  test('GET /apps lists and filters', async () => {
    await request(app).post('/api/hub/register').send({ id: 'a', name: 'Alpha', type: 'mobile' });
    await request(app).post('/api/hub/register').send({ id: 'b', name: 'Beta', type: 'saas', capabilities: ['search'] });
    const all = await request(app).get('/api/hub/apps');
    assert.equal(all.body.total, 2);
    const filtered = await request(app).get('/api/hub/apps?capability=search');
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.apps[0].id, 'b');
  });

  test('GET /apps/:id returns app or 404', async () => {
    await request(app).post('/api/hub/register').send({ id: 'a', name: 'Alpha' });
    const found = await request(app).get('/api/hub/apps/a');
    assert.equal(found.status, 200);
    assert.equal(found.body.app.name, 'Alpha');
    const missing = await request(app).get('/api/hub/apps/zzz');
    assert.equal(missing.status, 404);
  });

  test('POST /memory requires key and value', async () => {
    const ok = await request(app).post('/api/hub/memory').send({ scope: 'global', key: 'k1', value: 'v1' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);
    const bad = await request(app).post('/api/hub/memory').send({ scope: 'global', key: 'k1' });
    assert.equal(bad.status, 400);
  });

  test('GET /memory returns stored memories', async () => {
    await request(app).post('/api/hub/memory').send({ scope: 'global', key: 'k1', value: 'v1' });
    const res = await request(app).get('/api/hub/memory?scope=global');
    assert.equal(res.status, 200);
    assert.ok(res.body.memories.length >= 1);
  });

  test('POST /event delegates to event processor', async () => {
    const res = await request(app).post('/api/hub/event').send({ appId: 'app-1', type: 'job_found' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.processed, 'app-1');
  });

  test('POST /command delegates to command sender', async () => {
    const res = await request(app).post('/api/hub/command').send({ appId: 'app-1', command: 'start' });
    assert.equal(res.status, 200);
    assert.equal(res.body.appId, 'app-1');
  });

  test('POST /broadcast delegates to capability broadcast', async () => {
    const res = await request(app).post('/api/hub/broadcast').send({ capability: 'search', command: 'run' });
    assert.equal(res.status, 200);
    assert.equal(res.body.capability, 'search');
  });

  test('GET /status returns hub summary', async () => {
    const res = await request(app).get('/api/hub/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.hub.apps_total, 'number');
  });
});
