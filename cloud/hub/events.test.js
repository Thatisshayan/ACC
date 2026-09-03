'use strict';
// cloud/hub/events.test.js — regression coverage for the 2026-09-03 fix: event.type
// used to be looked up via EVENT_HANDLERS[event.type] (a plain {} literal), so
// event.type === 'constructor' resolved through the inherited Object.prototype
// chain to the real Object constructor instead of undefined, and calling it as
// Object(event) just returned the event object itself — letting a caller smuggle
// arbitrary fields (approval_required: false, automation_mode: 'auto', ...)
// straight into store.createTask() as the task spec. dispatchEvent() is now a
// plain switch with no lookup table for a crafted type to resolve through.

const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const events = require('./events.js');
const registry = require('./registry.js');
const store = require('../taskbus/store.js');

describe('hub event dispatch — prototype-pollution-shaped event.type', () => {
  test('event.type = "constructor" is treated as an unknown event type, not dispatched', async () => {
    mock.method(registry, 'heartbeat', () => true);
    const createTaskMock = mock.method(store, 'createTask', (spec) => ({ id: 'should-not-be-created', ...spec }));
    try {
      const result = await events.processEvent({
        appId: 'attacker-app',
        type: 'constructor',
        approval_required: false,
        automation_mode: 'auto',
        assigned_agent: 'claude',
        title: 'smuggled task',
        instruction: 'do something without approval',
      });
      assert.equal(result.success, true);
      assert.equal(result.action, 'logged');
      assert.equal(createTaskMock.mock.callCount(), 0, 'store.createTask must never be called for an unknown event.type');
    } finally {
      mock.restoreAll();
    }
  });

  test('other Object.prototype-shaped type names are also rejected', async () => {
    mock.method(registry, 'heartbeat', () => true);
    const createTaskMock = mock.method(store, 'createTask', (spec) => ({ id: 'x', ...spec }));
    try {
      for (const type of ['toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
        const result = await events.processEvent({ appId: 'a', type });
        assert.equal(result.action, 'logged', `type "${type}" should be treated as unknown`);
      }
      assert.equal(createTaskMock.mock.callCount(), 0);
    } finally {
      mock.restoreAll();
    }
  });

  test('a real, known event type still creates a task normally', async () => {
    mock.method(registry, 'heartbeat', () => true);
    const createTaskMock = mock.method(store, 'createTask', (spec) => ({ id: 'task-1', ...spec }));
    try {
      const result = await events.processEvent({ appId: 'a', type: 'user.action', action: 'clicked' });
      assert.equal(result.success, true);
      assert.equal(result.action, 'task_created');
      assert.equal(createTaskMock.mock.callCount(), 1);
    } finally {
      mock.restoreAll();
    }
  });
});
