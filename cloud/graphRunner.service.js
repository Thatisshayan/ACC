// cloud/graphRunner.service.js
'use strict';
const { v4: uuidv4 }            = require('uuid');
const { executeTask }           = require('./executor.js');
const { expandGraph }           = require('./orchestrator/graphExpander.js');
const { memoryEngine }          = require('./memory/memoryEngine.js');
const { createSnapshot }        = require('./security/ephemeralSnapshots.js');
const { redactObject }          = require('./security/piiRedactor.js');
const { requiresSnapshotApproval } = require('./security/policy.js');
const { notifyApprovalRequest } = require('./telegram/approvalBot.js');
const { broadcast }             = require('./ws/server.js');
const { log }                   = require('./utils/logger.js');
const { withRetry }             = require('./utils/retryPolicy.js');
const { writeToDLQ }            = require('./dlq/handler.js');

// In-memory graph state store
const graphs = new Map();

// ── Default config ────────────────────────────────────────────────────────────
const DEFAULT_CONCURRENCY  = 3;
const DEFAULT_NODE_TIMEOUT = 60_000;
const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs:  10_000,
  jitter:      'full',
};

// ── Public API ────────────────────────────────────────────────────────────────

async function startGraph(nodes, context = {}, options = {}) {
  const graphId     = options.graphId || uuidv4();
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const sandbox     = options.sandbox ?? context.sandbox ?? false;
  const retryPolicy = options.retryPolicy || DEFAULT_RETRY_POLICY;
  const tags        = options.tags || [];

  const state = {
    graphId,
    status:      'running',
    concurrency,
    sandbox,
    retryPolicy,
    tags,
    context,
    nodes: nodes.map(n => ({
      id:          n.id,
      type:        n.type || n.agentType,
      deps:        n.deps || n.dependsOn || [],
      payload:     n.payload,
      retryPolicy: n.retryPolicy || null,
      timeoutMs:   n.timeoutMs  || DEFAULT_NODE_TIMEOUT,
      metadata:    n.metadata   || n.meta || {},
      status:      'pending',
      attempts:    0,
      lastError:   null,
      startedAt:   null,
      finishedAt:  null,
      result:      null,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  graphs.set(graphId, state);
  memoryEngine.initSTM({ memory: {} });

  log(`[GraphRunnerService] Started graph ${graphId} (${nodes.length} nodes, concurrency=${concurrency})`);
  _broadcastStatus(graphId, 'running');

  _runLoop(graphId).catch(err => {
    log(`[GraphRunnerService] Unhandled error in graph ${graphId}:`, err.message);
    const s = graphs.get(graphId);
    if (s) { s.status = 'failed'; s.updatedAt = new Date().toISOString(); }
    _broadcastStatus(graphId, 'failed');
  });

  return { graphId, status: 'running' };
}

async function pauseGraph(graphId) {
  const state = graphs.get(graphId);
  if (!state) throw new Error(`Graph ${graphId} not found`);
  state.status    = 'paused';
  state.updatedAt = new Date().toISOString();
  _broadcastStatus(graphId, 'paused');
  log(`[GraphRunnerService] Paused graph ${graphId}`);
  return { graphId, status: 'paused' };
}

async function resumeGraph(graphId) {
  const state = graphs.get(graphId);
  if (!state) throw new Error(`Graph ${graphId} not found`);
  state.status    = 'running';
  state.updatedAt = new Date().toISOString();
  _broadcastStatus(graphId, 'running');
  log(`[GraphRunnerService] Resumed graph ${graphId}`);
  _runLoop(graphId).catch(err => log(`[GraphRunnerService] Resume error:`, err.message));
  return { graphId, status: 'running' };
}

async function stopGraph(graphId, reason = 'manual') {
  const state = graphs.get(graphId);
  if (!state) throw new Error(`Graph ${graphId} not found`);
  state.status    = 'stopped';
  state.updatedAt = new Date().toISOString();
  _broadcastStatus(graphId, 'stopped');
  log(`[GraphRunnerService] Stopped graph ${graphId}: ${reason}`);
  return { graphId, status: 'stopped', reason };
}

async function getSnapshot(graphId) {
  const state = graphs.get(graphId);
  if (!state) return null;
  return _buildSnapshot(state);
}

// ── Internal loop ─────────────────────────────────────────────────────────────

async function _runLoop(graphId) {
  const state = graphs.get(graphId);
  if (!state) return;

  const inDegree   = new Map();
  const dependents = new Map();
  for (const n of state.nodes) {
    inDegree.set(n.id, n.deps.length);
    dependents.set(n.id, []);
  }
  for (const n of state.nodes) {
    for (const dep of n.deps) {
      const list = dependents.get(dep) || [];
      list.push(n.id);
      dependents.set(dep, list);
    }
  }

  while (true) {
    if (state.status === 'paused') { await _sleep(500); continue; }
    if (state.status === 'stopped') break;

    const running  = state.nodes.filter(n => n.status === 'running').length;
    const slots    = state.concurrency - running;
    const runnable = state.nodes.filter(n =>
      n.status === 'pending' && inDegree.get(n.id) === 0
    ).slice(0, Math.max(0, slots));

    const allDone = state.nodes.every(n =>
      n.status === 'completed' || n.status === 'failed'
    );
    if (allDone) {
      const anyFailed = state.nodes.some(n => n.status === 'failed');
      state.status    = anyFailed ? 'completed_with_errors' : 'completed';
      state.updatedAt = new Date().toISOString();
      _broadcastStatus(graphId, state.status);
      log(`[GraphRunnerService] Graph ${graphId} ${state.status}`);
      break;
    }

    if (runnable.length === 0 && running === 0) {
      state.status    = 'deadlocked';
      state.updatedAt = new Date().toISOString();
      _broadcastStatus(graphId, 'deadlocked');
      log(`[GraphRunnerService] Graph ${graphId} deadlocked`);
      break;
    }

    for (const node of runnable) {
      node.status    = 'running';
      node.startedAt = new Date().toISOString();
      _executeNode(graphId, node, inDegree, dependents).catch(err => {
        log(`[GraphRunnerService] Node ${node.id} unhandled:`, err.message);
      });
    }

    await _sleep(200);
  }

  try {
    const fakeSnap = { memory: { stm: { extractedFacts: [], jobKeywords: [] } } };
    memoryEngine.mergeSTMtoLTM(fakeSnap);
  } catch (_) {}
}

async function _executeNode(graphId, node, inDegree, dependents) {
  const state = graphs.get(graphId);
  if (!state) return;

  const policy = node.retryPolicy || state.retryPolicy;

  try {
    const result = await withRetry(
      () => _runNodeOnce(graphId, node, state),
      policy,
      (attempt, err) => {
        node.attempts  = attempt;
        node.lastError = err.message;
        log(`[GraphRunnerService] Node ${node.id} attempt ${attempt} failed: ${err.message}`);
      }
    );

    node.status     = 'completed';
    node.result     = result;
    node.finishedAt = new Date().toISOString();
    node.updatedAt  = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    for (const depId of (dependents.get(node.id) || [])) {
      inDegree.set(depId, (inDegree.get(depId) || 1) - 1);
    }

    try {
      const snap = { nodes: state.nodes, getNodeOutput: id => state.nodes.find(x => x.id === id)?.result || null };
      const newNodes = await expandGraph(snap, node.id);
      if (Array.isArray(newNodes) && newNodes.length) {
        for (const nn of newNodes) {
          if (!state.nodes.find(x => x.id === nn.id)) {
            const nnDeps = nn.deps || nn.dependsOn || [];
            state.nodes.push({ ...nn, type: nn.type || nn.agentType, deps: nnDeps, status: 'pending', attempts: 0, lastError: null, startedAt: null, finishedAt: null, result: null });
            inDegree.set(nn.id, nnDeps.length);
            dependents.set(nn.id, []);
            for (const d of nnDeps) {
              const dl = dependents.get(d) || [];
              dl.push(nn.id);
              dependents.set(d, dl);
            }
            log(`[GraphRunnerService] Dynamically added node ${nn.id}`);
          }
        }
      }
    } catch (_) {}

    _broadcastNode(graphId, node, 'completed');

  } catch (err) {
    node.status     = 'failed';
    node.lastError  = err.message;
    node.finishedAt = new Date().toISOString();
    node.updatedAt  = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    log(`[GraphRunnerService] Node ${node.id} permanently failed: ${err.message}`);

    try {
      await writeToDLQ({ graphId, node, context: _redactContext(state.context), error: err.message });
    } catch (dlqErr) {
      log(`[GraphRunnerService] DLQ write failed:`, dlqErr.message);
    }

    _broadcastNode(graphId, node, 'failed');
  }
}

async function _runNodeOnce(graphId, node, state) {
  const { context, sandbox } = state;

  const task = {
    id:        node.id,
    agentType: node.type,
    payload:   node.payload,
    meta: {
      ...node.metadata,
      graphId,
      snapshotId:     graphId,
      tenantId:       context.tenantId,
      userId:         context.userId,
      requestId:      context.requestId,
      vaultScope:     context.vaultScope,
      rateLimitScope: context.rateLimitScope,
      sandbox,
    },
  };

  const result = await Promise.race([
    executeTask(task),
    _timeoutPromise(node.timeoutMs, `Node ${node.id} timed out after ${node.timeoutMs}ms`),
  ]);

  if (!result || result.success === false) {
    throw new Error(result?.error || `Node ${node.id} returned failure`);
  }

  await _handleSnapshot(graphId, node, result, context);
  return result;
}

async function _handleSnapshot(graphId, node, result, context) {
  const needsSnap = requiresSnapshotApproval() &&
    (node.metadata?.sensitive || node.metadata?.requiresApproval || node.type === 'browser');

  if (!needsSnap) {
    try { broadcast('nodeUpdate', { graphId, nodeId: node.id, type: node.type, status: 'completed' }); } catch (_) {}
    return;
  }

  const redacted = redactObject(typeof result === 'object' ? result : { output: String(result) });
  const preview  = {
    nodeId:        node.id,
    agentType:     node.type,
    meta:          node.metadata,
    outputSummary: JSON.stringify(redacted).slice(0, 2000),
  };

  const snap = createSnapshot({
    data: preview,
    meta: { nodeId: node.id, graphId, createdBy: context.role || 'Agent', taskId: context.requestId || null },
  });

  node.status    = 'pendingApproval';
  node.updatedAt = new Date().toISOString();

  try {
    await notifyApprovalRequest({
      snapshotId: snap.id,
      summary:    `Graph ${graphId} node ${node.id} (${node.type}) awaiting approval.`,
    });
  } catch (_) {}

  try { broadcast('nodeUpdate', { graphId, nodeId: node.id, type: node.type, status: 'pendingApproval', snapshotId: snap.id }); } catch (_) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _buildSnapshot(state) {
  return {
    graphId:   state.graphId,
    status:    state.status,
    nodes:     state.nodes.map(n => ({
      id:         n.id,
      status:     n.status,
      attempts:   n.attempts,
      lastError:  n.lastError,
      startedAt:  n.startedAt,
      finishedAt: n.finishedAt,
    })),
    context:   _redactContext(state.context),
    tags:      state.tags,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function _redactContext(ctx) {
  if (!ctx) return {};
  const { vaultScope, rateLimitScope, ...safe } = ctx;
  return safe;
}

function _broadcastStatus(graphId, status) {
  try { broadcast('graphStatus', { graphId, status }); } catch (_) {}
}

function _broadcastNode(graphId, node, status) {
  try { broadcast('nodeUpdate', { graphId, nodeId: node.id, type: node.type, status, attempts: node.attempts }); } catch (_) {}
}

function _sleep(ms)          { return new Promise(r => setTimeout(r, ms)); }
function _timeoutPromise(ms, msg) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

module.exports = { startGraph, pauseGraph, resumeGraph, stopGraph, getSnapshot, graphs };
