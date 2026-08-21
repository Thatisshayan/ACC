'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const snapshots = new Map();

function resetSnapshots() {
  snapshots.clear();
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);

  if (resolved.endsWith(path.join('cloud', 'executor.js'))) {
    return {
      executeTask: async ({ payload }) => ({ success: true, output: payload && payload.label ? payload.label : 'ok' }),
    };
  }
  if (resolved.endsWith(path.join('cloud', 'orchestrator', 'graphExpander.js'))) {
    return { expandGraph: async () => [] };
  }
  if (resolved.endsWith(path.join('cloud', 'memory', 'memoryEngine.js'))) {
    return { memoryEngine: { initSTM() {}, mergeSTMtoLTM() {} } };
  }
  if (resolved.endsWith(path.join('cloud', 'security', 'ephemeralSnapshots.js'))) {
    return {
      createSnapshot: ({ data, meta }) => {
        const id = 'snap-' + (snapshots.size + 1);
        const record = { id, data, meta, pendingApproval: true, approvedAt: null };
        snapshots.set(id, record);
        return record;
      },
      getSnapshot: (id) => snapshots.get(id) || null,
    };
  }
  if (resolved.endsWith(path.join('cloud', 'security', 'piiRedactor.js'))) {
    return { redactObject: (value) => value };
  }
  if (resolved.endsWith(path.join('cloud', 'security', 'policy.js'))) {
    return { requiresSnapshotApproval: () => true };
  }
  if (resolved.endsWith(path.join('cloud', 'telegram', 'approvalBot.js'))) {
    return { notifyApprovalRequest: async () => ({ ok: true }) };
  }
  if (resolved.endsWith(path.join('cloud', 'ws', 'server.js'))) {
    return { broadcast() {} };
  }
  if (resolved.endsWith(path.join('cloud', 'utils', 'logger.js'))) {
    return { log() {} };
  }
  if (resolved.endsWith(path.join('cloud', 'utils', 'retryPolicy.js'))) {
    return { withRetry: async (fn) => fn() };
  }
  if (resolved.endsWith(path.join('cloud', 'dlq', 'handler.js'))) {
    return { writeToDLQ: async () => ({ id: 'dlq-1' }) };
  }

  return originalLoad.apply(this, arguments);
};

const graphRunner = require('./graphRunner.service.js');

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}

test('sensitive graph nodes remain pendingApproval until the snapshot is approved', async () => {
  resetSnapshots();
  const result = await graphRunner.startGraph([
    { id: 'node-1', type: 'browser', payload: { label: 'first' }, metadata: { sensitive: true } },
    { id: 'node-2', type: 'writer', payload: { label: 'second' }, deps: ['node-1'] },
  ]);

  await waitFor(() => {
    const state = graphRunner.graphs.get(result.graphId);
    return state
      && state.nodes.find((node) => node.id === 'node-1')?.status === 'pendingApproval'
      && state.status === 'awaiting_approval';
  });

  const stateBeforeApproval = graphRunner.graphs.get(result.graphId);
  const firstNode = stateBeforeApproval.nodes.find((node) => node.id === 'node-1');
  const secondNode = stateBeforeApproval.nodes.find((node) => node.id === 'node-2');

  assert.equal(firstNode.status, 'pendingApproval');
  assert.equal(secondNode.status, 'pending');
  assert.equal(stateBeforeApproval.status, 'awaiting_approval');

  const snapshot = snapshots.get(firstNode.pendingSnapshotId);
  snapshot.pendingApproval = false;
  snapshot.approvedAt = Date.now();

  await waitFor(() => {
    const state = graphRunner.graphs.get(result.graphId);
    return state
      && state.nodes.every((node) => node.status === 'completed')
      && state.status === 'completed';
  });
});

test('rejected snapshots fail the waiting node instead of silently completing it', async () => {
  resetSnapshots();
  const result = await graphRunner.startGraph([
    { id: 'node-reject', type: 'browser', payload: { label: 'first' }, metadata: { sensitive: true } },
  ]);

  await waitFor(() => {
    const state = graphRunner.graphs.get(result.graphId);
    return state && state.nodes[0]?.status === 'pendingApproval';
  });

  const state = graphRunner.graphs.get(result.graphId);
  const waitingNode = state.nodes[0];
  snapshots.delete(waitingNode.pendingSnapshotId);

  await waitFor(() => {
    const updated = graphRunner.graphs.get(result.graphId);
    return updated && updated.nodes[0]?.status === 'failed';
  });

  const failedState = graphRunner.graphs.get(result.graphId);
  assert.match(failedState.nodes[0].lastError, /Snapshot rejected, expired, or missing/);
});
