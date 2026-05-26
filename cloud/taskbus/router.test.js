// cloud/taskbus/router.test.js
// Unit tests for the task router.
// Run: node cloud/taskbus/router.test.js
'use strict';

var assert = require('assert');
var path   = require('path');
var fs     = require('fs');

// ── Minimal store mock ────────────────────────────────────────────────────────
var _tasks     = {};
var _approvals = {};

var storeMock = {
  getTask: function(id) { return _tasks[id] || null; },
  updateTask: function(id, patch) {
    if (!_tasks[id]) return null;
    Object.assign(_tasks[id], patch, { updated_at: new Date().toISOString() });
    return _tasks[id];
  },
  addResult: function(opts) {
    var r = Object.assign({ id: 'result-' + Date.now() }, opts);
    return r;
  },
  addMessage: function() {},
  createApproval: function(taskId, action) {
    var a = { id: 'approval-' + Date.now(), task_id: taskId, action: action, status: 'pending' };
    _approvals[a.id] = a;
    return a;
  },
  getPendingApprovals: function() {
    return Object.values(_approvals).filter(function(a) { return a.status === 'pending'; });
  },
  hasApprovedApproval: function(taskId, action) {
    return Object.values(_approvals).some(function(a) {
      return a.task_id === taskId && a.status === 'approved' && a.action === action;
    });
  },
  createTask: function(opts) {
    var t = Object.assign({ id: 'child-' + Date.now(), status: 'pending' }, opts);
    _tasks[t.id] = t;
    return t;
  },
};

// ── Inject mock store into router ─────────────────────────────────────────────
// We monkey-patch require so the router gets our mock store.
var Module = require('module');
var _origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  var resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch(_) {}
  if (resolved.endsWith('store.js') && resolved.includes('taskbus')) return storeMock;
  if (resolved.endsWith('logger.js')) return { log: function() {} };
  if (resolved.endsWith('providerFallback.js')) {
    return {
      executeWithProviderFallback: async function(task) {
        return {
          provider_used: 'smart_stub',
          provider_chain_attempted: ['smart_stub'],
          fallback_reason: 'test',
          execution_mode: 'semi_auto',
          cost_tier: 'zero_cost_stub',
          is_real_ai_result: false,
          summary: 'stub result',
          output: 'stub output',
          files_changed: [],
          risks: [],
          next_request: '',
        };
      }
    };
  }
  return _origLoad.apply(this, arguments);
};

var router = require('./router.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTask(overrides) {
  var id = 'task-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6);
  var t = Object.assign({
    id: id,
    title: 'Test task',
    instruction: 'Do something',
    assigned_agent: 'claude',
    status: 'pending',
    priority: 'normal',
    automation_mode: 'semi_auto',
    approval_required: false,
    created_by: 'test_user',
    userId: 'test_user',
    meta: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, overrides);
  _tasks[t.id] = t;
  return t;
}

var passed = 0;
var failed = 0;

async function test(name, fn) {
  // Reset state between tests
  _tasks     = {};
  _approvals = {};
  try {
    await fn();
    console.log('  ✓', name);
    passed++;
  } catch (err) {
    console.error('  ✗', name);
    console.error('    ', err.message);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('\nrouter.js unit tests\n');

(async function runTests() {

await test('returns error for unknown task id', async function() {
  var result = await router.routeTask('nonexistent-id');
  assert.strictEqual(result.status, 'error');
  assert.ok(result.error.includes('not found'));
});

await test('high-risk task requires approval', async function() {
  var t = makeTask({ title: 'send email to client', approval_required: false });
  var result = await router.routeTask(t.id);
  assert.strictEqual(result.status, 'waiting_approval');
  assert.ok(result.approvalId, 'should have approvalId');
  assert.strictEqual(_tasks[t.id].status, 'waiting_approval');
});

await test('high-risk task with existing approval routes through', async function() {
  var t = makeTask({ title: 'send email to client', approval_required: false });
  // Pre-inject approved approval
  _approvals['pre-approved'] = { id: 'pre-approved', task_id: t.id, action: 'high_risk_execution', status: 'approved' };
  var result = await router.routeTask(t.id);
  // Should not be blocked – falls through to provider chain since resend not configured
  assert.notStrictEqual(result.status, 'waiting_approval');
});

await test('full_auto mode with high-risk task is blocked', async function() {
  var t = makeTask({ title: 'publish to linkedin', automation_mode: 'full_auto', approval_required: false });
  var result = await router.routeTask(t.id);
  assert.strictEqual(result.status, 'waiting_approval');
  assert.strictEqual(_tasks[t.id].automation_mode, 'sandbox', 'mode should be downgraded to sandbox');
});

await test('manual mode stores task and returns assigned', async function() {
  var t = makeTask({ automation_mode: 'manual', assigned_agent: 'claude' });
  var result = await router.routeTask(t.id);
  assert.strictEqual(result.status, 'assigned');
  assert.strictEqual(_tasks[t.id].status, 'pending');
});

await test('manual agent (chatgpt) stores task and returns assigned', async function() {
  var t = makeTask({ assigned_agent: 'chatgpt' });
  var result = await router.routeTask(t.id);
  assert.strictEqual(result.status, 'assigned');
});

await test('delete keyword triggers high-risk gate', async function() {
  var t = makeTask({ title: 'delete all records', approval_required: false });
  var result = await router.routeTask(t.id);
  assert.strictEqual(result.status, 'waiting_approval');
});

await test('normal task routes to provider fallback chain', async function() {
  var t = makeTask({ title: 'write a blog post', approval_required: false });
  var result = await router.routeTask(t.id);
  assert.ok(['done', 'waiting_approval'].indexOf(result.status) !== -1);
  assert.ok(result.provider_used, 'should have provider_used');
});

await test('rate limit blocks after exceeding max', async function() {
  // Create MAX+1 tasks as the same user
  var userId = 'rate-test-user-' + Date.now();
  var max = parseInt(process.env.MAX_TASKS_PER_USER_PER_HOUR || '30');
  var results = [];
  for (var i = 0; i <= max; i++) {
    var t = makeTask({ created_by: userId, title: 'rate limit test task ' + i, approval_required: false });
    var r = await router.routeTask(t.id);
    results.push(r);
  }
  var lastResult = results[results.length - 1];
  assert.strictEqual(lastResult.status, 'rate_limited', 'last task should be rate limited');
});

await test('isHighRisk correctly identifies high-risk patterns', function() {
  assert.ok(router.isHighRisk({ title: 'send email to boss', instruction: '' }));
  assert.ok(router.isHighRisk({ title: 'publish post', instruction: '' }));
  assert.ok(router.isHighRisk({ title: 'delete database', instruction: '' }));
  assert.ok(router.isHighRisk({ title: 'payment gateway test', instruction: '' }));
  assert.ok(!router.isHighRisk({ title: 'write a report', instruction: '' }));
  assert.ok(!router.isHighRisk({ title: 'research competitors', instruction: '' }));
});

await test('bypass agents (tavily) skip safety gate even with publish in title', async function() {
  // Tavily is a bypass agent – if it's enabled it should execute even if title contains publish.
  // Since tavily won't be enabled in test env, it falls through to the provider chain.
  // What matters is it does NOT hit the high-risk gate and return waiting_approval.
  var t = makeTask({ assigned_agent: 'tavily', title: 'publish research on tavily', approval_required: false });
  var result = await router.routeTask(t.id);
  // tavily not configured in test, falls to provider chain
  assert.notStrictEqual(result.status, 'waiting_approval', 'bypass agent should not hit approval gate');
});

await test('user-supplied "scheduler" created_by does NOT bypass rate limit', async function() {
  // Before the fix, created_by:'scheduler' skipped rate limiting entirely.
  // After the fix, it's just another userId string and gets counted normally.
  var max = parseInt(process.env.MAX_TASKS_PER_USER_PER_HOUR || '30');
  var results = [];
  for (var i = 0; i <= max; i++) {
    var t = makeTask({ created_by: 'scheduler', title: 'scheduler task ' + i, approval_required: false });
    var r = await router.routeTask(t.id);
    results.push(r);
  }
  var lastResult = results[results.length - 1];
  assert.strictEqual(lastResult.status, 'rate_limited', 'scheduler string should NOT bypass rate limit');
});

// ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
