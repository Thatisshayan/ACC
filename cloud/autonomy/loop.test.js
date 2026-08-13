'use strict';
// cloud/autonomy/loop.test.js — autonomous loop engine (scheduling + execution).

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const loop = require('./loop.js');
const memory = require('../memory/store.js');
const store = require('../taskbus/store.js');
const router = require('../taskbus/router.js');

let memMap;

function clearLoopEnv() {
  delete process.env.ACC_OWNER_TELEGRAM_CHAT_ID;
  delete process.env.SHAYAN_TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
}

beforeEach(() => {
  clearLoopEnv();
  memMap = new Map();
  mock.method(memory, 'remember', (scope, key, value) => { memMap.set(scope + ':' + key, value); return value; });
  mock.method(memory, 'recall', (scope, key) => memMap.get(scope + ':' + key) || null);
  mock.method(memory, 'recallAll', (scope) =>
    [...memMap.entries()].filter(([k]) => k.startsWith(scope + ':'))
      .map(([k, v]) => ({ key: k.slice(scope.length + 1), value: v })));
  mock.method(memory, 'forget', (scope, key) => memMap.delete(scope + ':' + key));
  mock.method(memory, 'logEvent', () => {});
  mock.method(memory, 'getEvents', () => []);
});

afterEach(() => { mock.restoreAll(); });

describe('autonomy loop engine (Phase 3)', () => {
  test('createLoop requires name and goal', () => {
    assert.throws(() => loop.createLoop({ name: 'x' }), /name and goal required/);
    assert.throws(() => loop.createLoop({ goal: 'y' }), /name and goal required/);
  });

  test('createLoop applies defaults and persists', () => {
    const l = loop.createLoop({ name: 'Daily', goal: 'Summarize tasks' });
    assert.ok(l.id);
    assert.equal(l.enabled, true);
    assert.equal(l.intervalMs, 3600000);
    assert.equal(l.consecutiveFailures, 0);
    assert.equal(loop.getLoop(l.id).name, 'Daily');
    assert.equal(loop.getAllLoops().length, 1);
  });

  test('updateLoop patches and returns null for unknown', () => {
    const l = loop.createLoop({ name: 'A', goal: 'G' });
    const updated = loop.updateLoop(l.id, { intervalMs: 60000 });
    assert.equal(updated.intervalMs, 60000);
    assert.equal(loop.updateLoop('missing', {}), null);
  });

  test('enable/disable toggle state', () => {
    const l = loop.createLoop({ name: 'A', goal: 'G' });
    loop.disableLoop(l.id);
    assert.equal(loop.getLoop(l.id).enabled, false);
    loop.enableLoop(l.id);
    assert.equal(loop.getLoop(l.id).enabled, true);
  });

  test('deleteLoop removes the loop', () => {
    const l = loop.createLoop({ name: 'A', goal: 'G' });
    assert.equal(loop.deleteLoop(l.id), true);
    assert.equal(loop.getLoop(l.id), null);
  });

  test('seedDefaultLoops is idempotent', () => {
    loop.seedDefaultLoops();
    const first = loop.getAllLoops().length;
    assert.equal(first, 3);
    loop.seedDefaultLoops();
    assert.equal(loop.getAllLoops().length, 3);
  });

  test('stats reports totals and enabled counts', () => {
    loop.createLoop({ name: 'A', goal: 'G', enabled: true });
    loop.createLoop({ name: 'B', goal: 'G', enabled: false });
    const s = loop.stats();
    assert.equal(s.total, 2);
    assert.equal(s.enabled, 1);
  });

  test('runNow records a successful run', async () => {
    const l = loop.createLoop({ name: 'A', goal: 'Do work', intervalMs: 1000 });
    mock.method(store, 'createTask', (opts) => Object.assign({ id: 'task-1' }, opts));
    mock.method(router, 'routeTask', async () => ({ status: 'completed', output: 'loop output' }));
    await loop.runNow(l.id);
    const refreshed = loop.getLoop(l.id);
    assert.equal(refreshed.lastStatus, 'success');
    assert.equal(refreshed.lastResult, 'loop output');
    assert.equal(refreshed.consecutiveFailures, 0);
  });

  test('runNow records a failure and disables after max consecutive failures', async () => {
    const l = loop.createLoop({ name: 'Flaky', goal: 'Do work', intervalMs: 1000, maxConsecutiveFailures: 2 });
    mock.method(store, 'createTask', (opts) => Object.assign({ id: 'task-1' }, opts));
    mock.method(router, 'routeTask', async () => { throw new Error('provider outage'); });
    await loop.runNow(l.id);
    let refreshed = loop.getLoop(l.id);
    assert.equal(refreshed.lastStatus, 'failed');
    assert.equal(refreshed.consecutiveFailures, 1);
    assert.equal(refreshed.enabled, true);
    await loop.runNow(l.id);
    refreshed = loop.getLoop(l.id);
    assert.equal(refreshed.consecutiveFailures, 2);
    assert.equal(refreshed.enabled, false);
  });
});
