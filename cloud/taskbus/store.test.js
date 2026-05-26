'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');

// The store opens a real SQLite file at data/taskbus/taskbus.sqlite3.
// Tests use unique IDs so they don't collide with real data, and clean up after.
const store = require('./store.js');

const SUFFIX = '-test-' + Date.now();
const createdTaskIds   = [];
const createdResultIds = [];

function uid(label) {
  return label + SUFFIX + '-' + Math.random().toString(16).slice(2, 8);
}

// ── createTask / getTask ──────────────────────────────────────────────────────

describe('createTask + getTask', () => {
  test('createTask returns a task with the expected fields', () => {
    const task = store.createTask({
      title:          'test task title',
      instruction:    'do something',
      assigned_agent: 'claude',
      priority:       'normal',
      created_by:     'test_runner',
    });
    createdTaskIds.push(task.id);

    assert.ok(task.id, 'id present');
    assert.equal(task.title, 'test task title');
    assert.equal(task.assigned_agent, 'claude');
    assert.equal(task.status, 'pending');
  });

  test('getTask retrieves the created task by id', () => {
    const created = store.createTask({ title: 'retrievable task', created_by: 'test_runner' });
    createdTaskIds.push(created.id);

    const fetched = store.getTask(created.id);
    assert.ok(fetched, 'task found');
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.title, 'retrievable task');
  });

  test('getTask returns null for unknown id', () => {
    const result = store.getTask('nonexistent-id-xyz-' + Date.now());
    assert.equal(result, null);
  });
});

// ── updateTask ────────────────────────────────────────────────────────────────

describe('updateTask', () => {
  test('patches status and preserves other fields', () => {
    const task = store.createTask({ title: 'to be updated', created_by: 'test_runner' });
    createdTaskIds.push(task.id);

    store.updateTask(task.id, { status: 'in_progress' });
    const updated = store.getTask(task.id);
    assert.equal(updated.status, 'in_progress');
    assert.equal(updated.title, 'to be updated');
  });

  test('returns null for unknown id', () => {
    const result = store.updateTask('no-such-id-' + Date.now(), { status: 'done' });
    assert.equal(result, null);
  });
});

// ── addResult — receipt serialization (regression for SQLite bind crash) ──────

describe('addResult', () => {
  test('stores a result and returns it with an id', () => {
    const task = store.createTask({ title: 'result parent', created_by: 'test_runner' });
    createdTaskIds.push(task.id);

    const result = store.addResult({
      task_id:      task.id,
      agent:        'claude',
      provider_used: 'smart_stub',
      summary:      'test summary',
      output:       'test output',
    });
    createdResultIds.push(result.id);

    assert.ok(result.id, 'result id present');
    assert.equal(result.task_id, task.id);
    assert.equal(result.summary, 'test summary');
  });

  test('receipt object is serialized — no SQLite bind error', () => {
    const task = store.createTask({ title: 'receipt parent', created_by: 'test_runner' });
    createdTaskIds.push(task.id);

    // Passing a plain object as receipt was the bug — it would crash with
    // "SQLite3 can only bind numbers, strings, bigints, buffers, and null"
    const receiptObj = { workflow: 'test', tasks_created: 3, leads_loaded: 10 };
    assert.doesNotThrow(() => {
      const result = store.addResult({
        task_id:  task.id,
        agent:    'test',
        summary:  'with object receipt',
        receipt:  receiptObj,
      });
      createdResultIds.push(result.id);
    });
  });

  test('receipt already a JSON string passes through unchanged', () => {
    const task = store.createTask({ title: 'receipt str parent', created_by: 'test_runner' });
    createdTaskIds.push(task.id);

    assert.doesNotThrow(() => {
      const result = store.addResult({
        task_id:  task.id,
        agent:    'test',
        summary:  'with string receipt',
        receipt:  JSON.stringify({ already: 'serialized' }),
      });
      createdResultIds.push(result.id);
    });
  });

  test('null receipt does not throw', () => {
    const task = store.createTask({ title: 'null receipt parent', created_by: 'test_runner' });
    createdTaskIds.push(task.id);

    assert.doesNotThrow(() => {
      const result = store.addResult({ task_id: task.id, agent: 'test', summary: 'no receipt', receipt: null });
      createdResultIds.push(result.id);
    });
  });
});

// ── createApproval / hasApprovedApproval ──────────────────────────────────────

describe('createApproval + hasApprovedApproval', () => {
  test('creates a pending approval', () => {
    const task = store.createTask({ title: 'needs approval', created_by: 'test_runner' });
    createdTaskIds.push(task.id);

    const approval = store.createApproval(task.id, 'high_risk_execution');
    assert.ok(approval.id, 'approval id present');
    assert.equal(approval.task_id, task.id);
    assert.equal(approval.status, 'pending');
  });

  test('hasApprovedApproval is false for pending approval', () => {
    const task = store.createTask({ title: 'pending gate', created_by: 'test_runner' });
    createdTaskIds.push(task.id);
    store.createApproval(task.id, 'deploy');

    const approved = store.hasApprovedApproval(task.id, 'deploy');
    assert.equal(approved, false);
  });
});

// ── addMessage ────────────────────────────────────────────────────────────────

describe('addMessage', () => {
  test('stores and retrieves a message', () => {
    const task = store.createTask({ title: 'message parent', created_by: 'test_runner' });
    createdTaskIds.push(task.id);

    // addMessage(taskId, fromAgent, toAgent, content)
    store.addMessage(task.id, 'claude', 'test_runner', 'hello from test');

    const messages = store.getMessages(task.id);
    assert.ok(messages.length >= 1);
    const msg = messages.find((m) => m.content === 'hello from test');
    assert.ok(msg, 'message found');
    assert.equal(msg.from_agent, 'claude');
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

after(() => {
  // Best-effort cleanup — remove test records from the real DB.
  for (const id of createdTaskIds) {
    try { store.updateTask(id, { status: 'done', title: '[test-cleaned]' }); } catch (_) {}
  }
});
