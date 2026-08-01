'use strict';
// cloud/queue.test.js — task queue: enqueue/get/prioritize/update.
// Pure in-memory module, no side effects; the exported `tasks` Map is cleared
// between tests for isolation.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const queue = require('./queue.js');
const { enqueueTask, getTask, getNextTask, updateTask, getAllTasks } = queue;

describe('queue', () => {
  beforeEach(() => {
    queue.tasks.clear();
  });

  test('enqueueTask then getTask returns the same task (happy path)', () => {
    const task = enqueueTask({ agentType: 'writer', payload: { prompt: 'hello' }, meta: { userId: 'u1', role: 'admin' } });
    assert.ok(task.id, 'task has an id');
    assert.equal(task.status, 'queued');
    assert.equal(task.agentType, 'writer');
    assert.equal(task.meta.role, 'admin');
    assert.equal(task.meta.priority, 3, 'admin role maps to high priority');
    assert.ok(task.createdAt, 'createdAt is set');
    assert.deepEqual(getTask(task.id), task);
  });

  test('getTask returns null for an unknown id', () => {
    assert.equal(getTask('task-does-not-exist'), null);
  });

  test('priority derives from role: power=3, default normal=2, guest=1', () => {
    assert.equal(enqueueTask({ agentType: 'x', payload: {}, meta: { role: 'power' } }).meta.priority, 3);
    assert.equal(enqueueTask({ agentType: 'x', payload: {} }).meta.priority, 2);
    assert.equal(enqueueTask({ agentType: 'x', payload: {}, meta: { role: 'guest' } }).meta.priority, 1);
  });

  test('explicit meta.priority overrides role mapping', () => {
    const task = enqueueTask({ agentType: 'x', payload: {}, meta: { role: 'guest', priority: 5 } });
    assert.equal(task.meta.priority, 5);
  });

  test('getNextTask returns highest-priority queued task, oldest first on ties', () => {
    const low = enqueueTask({ agentType: 'a', payload: {}, meta: { role: 'guest' } });
    const high = enqueueTask({ agentType: 'b', payload: {}, meta: { role: 'admin' } });
    assert.equal(getNextTask().id, high.id, 'higher priority wins');

    // Only queued tasks are eligible.
    updateTask(high.id, { status: 'running' });
    assert.equal(getNextTask().id, low.id, 'running tasks are skipped');

    // Ties broken by age (oldest first).
    updateTask(high.id, { status: 'queued' });
    const newerHigh = enqueueTask({ agentType: 'c', payload: {}, meta: { role: 'admin' } });
    assert.equal(getNextTask().id, high.id, 'older high-priority task wins the tie');
    assert.ok(newerHigh, 'sanity: newerHigh exists');
  });

  test('getNextTask returns null when nothing is queued', () => {
    const task = enqueueTask({ agentType: 'x', payload: {}, meta: { role: 'admin' } });
    updateTask(task.id, { status: 'completed' });
    assert.equal(getNextTask(), null);
  });

  test('updateTask patches a task, bumps updatedAt, and returns null for an unknown id', async () => {
    const task = enqueueTask({ agentType: 'x', payload: {}, meta: {} });
    const before = task.updatedAt;
    await new Promise((r) => setTimeout(r, 5)); // updatedAt has ms resolution
    const updated = updateTask(task.id, { status: 'running', error: null });
    assert.equal(updated.status, 'running');
    assert.notEqual(updated.updatedAt, before, 'updatedAt is bumped');
    assert.equal(getTask(task.id).status, 'running');
    assert.equal(updateTask('nope', { status: 'failed' }), null);
  });

  test('getAllTasks returns every task in insertion order', () => {
    const a = enqueueTask({ agentType: 'a', payload: {}, meta: {} });
    const b = enqueueTask({ agentType: 'b', payload: {}, meta: {} });
    assert.deepEqual(getAllTasks().map((t) => t.id), [a.id, b.id]);
  });
});
