'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const dlq = require('./handler.js');

const DLQ_DIR = path.join(__dirname, 'items');

describe('dlq path safety', () => {
  let record;
  beforeEach(() => {
    record = dlq.writeToDLQ({
      graphId: 'g1',
      node: { id: 'node-1', type: 'test', payload: {}, attempts: 1 },
      context: {},
      error: 'boom',
    });
  });
  afterEach(() => {
    try { dlq.deleteDLQItem(record.id); } catch { /* already gone */ }
  });

  test('writeToDLQ produces an id matching the expected safe shape', () => {
    assert.match(record.id, /^dlq_[0-9]+_[a-zA-Z0-9_]+$/);
  });

  test('getDLQItem rejects a path-traversal id instead of reading outside DLQ_DIR', () => {
    assert.equal(dlq.getDLQItem('../../../../etc/passwd'), null);
    assert.equal(dlq.getDLQItem('..%2f..%2fetc%2fpasswd'), null);
  });

  test('markRequeued/deleteDLQItem reject a path-traversal id (no-op, not throw)', () => {
    assert.equal(dlq.markRequeued('../../../../etc/passwd'), false);
    assert.equal(dlq.deleteDLQItem('../../../../etc/passwd'), false);
  });

  test('a malicious id cannot delete a real DLQ item that happens to share a resolved path', () => {
    // Confirms the resolved-path containment check doesn't accidentally let a
    // crafted-but-technically-in-bounds id through — only exact valid ids work.
    assert.equal(dlq.deleteDLQItem(record.id + '/../' + record.id), false);
    assert.notEqual(dlq.getDLQItem(record.id), null);
  });

  test('getDLQItem round-trips a legitimately written item', () => {
    const item = dlq.getDLQItem(record.id);
    assert.equal(item.graphId, 'g1');
    assert.equal(item.nodeId, 'node-1');
  });
});
