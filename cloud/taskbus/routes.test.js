'use strict';
// cloud/taskbus/routes.test.js — /api/taskbus HTTP API.
//
// routes.js destructures routeTask/notifyTelegramFailure/getProvidersStatus/
// runLeadCollectorPollerOnce at load, so those modules are stubbed via
// require.cache BEFORE the router is required (mock.method cannot reach
// destructured bindings). The taskbus store itself is real (local SQLite,
// same as store.test.js).

const path = require('path');
const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

function cacheStub(absPath, exports) {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

cacheStub(path.resolve(__dirname, 'router.js'), {
  routeTask: async () => ({ status: 'completed', output: 'fake output', provider_used: 'smart_stub' }),
  notifyTelegramFailure: () => {},
});
cacheStub(path.resolve(__dirname, 'providerFallback.js'), {
  getProvidersStatus: async () => ({
    deepseek:  { status: 'key_set', note: 'ready' },
    claude:    { status: 'no_key', note: 'add key' },
    ollama:    { status: 'offline', note: 'not running' },
    alibaba:   { status: 'no_key', note: 'add key' },
    perplexity:{ status: 'no_key', note: 'add key' },
    smart_stub:{ status: 'always_available', note: '' },
  }),
});
cacheStub(path.resolve(__dirname, '../workflows/leadCollectorPoller.js'), {
  runLeadCollectorPollerOnce: async () => ({}),
});

const routes = require('./routes.js');
const store = require('./store.js');
const workflowRegistry = require('../workflows/registry.js');
const workflowDispatcher = require('../workflows/dispatcher.js');
const outreachCrm = require('../workflows/accOutreachCrmModule.js');

let app;

function mount() {
  app = express();
  app.use(express.json());
  app.use('/api/taskbus', routes);
}

beforeEach(() => {
  mock.method(workflowRegistry, 'listWorkflows', () => []);
  mock.method(workflowDispatcher, 'launchWorkflow', async (key) => ({ success: true, workflow: key, taskId: 'wf-task-1' }));
  mock.method(workflowDispatcher, 'launchWorkflowsInParallel', async (keys) => ({ success: true, launched: keys.length }));
  mock.method(workflowDispatcher, 'describeWorkflowCatalog', () => []);
  mock.method(outreachCrm, 'health', () => ({ ok: true }));
  mock.method(outreachCrm, 'bootstrapOutreachCrm', async () => ({ success: true }));
  mount();
});

afterEach(() => { mock.restoreAll(); });

describe('taskbus routes (Phase 3)', () => {
  test('GET /agents returns agent list with provider status', async () => {
    const res = await request(app).get('/api/taskbus/agents');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.agents));
    assert.ok(res.body.agents.length > 0);
    assert.ok('provider_status' in res.body.agents[0]);
  });

  test('GET /stats returns store stats', async () => {
    const res = await request(app).get('/api/taskbus/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.stats, 'object');
  });

  test('GET /providers/status returns provider health', async () => {
    const res = await request(app).get('/api/taskbus/providers/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.providers.deepseek.status, 'key_set');
    assert.ok(Array.isArray(res.body.provider_order));
  });

  test('POST /task with manual mode skips auto-routing', async () => {
    const res = await request(app).post('/api/taskbus/task').send({
      title: 'manual task', instruction: 'x', automation_mode: 'manual',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.routing.status, 'manual');
  });

  test('POST /task with auto mode routes through the chain', async () => {
    const res = await request(app).post('/api/taskbus/task').send({
      title: 'auto task', instruction: 'x', automation_mode: 'auto',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.routing.status, 'completed');
  });

  test('GET /tasks filters by status', async () => {
    await request(app).post('/api/taskbus/task').send({ title: 'pending one', instruction: 'x', automation_mode: 'manual' });
    const res = await request(app).get('/api/taskbus/tasks?status=pending');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.tasks));
    assert.ok(res.body.tasks.some((t) => t.title === 'pending one'));
  });

  test('GET /task/:id returns task with messages/results or 404', async () => {
    const created = await request(app).post('/api/taskbus/task').send({ title: 'detail', instruction: 'x', automation_mode: 'manual' });
    const id = created.body.task.id;
    const res = await request(app).get('/api/taskbus/task/' + id);
    assert.equal(res.status, 200);
    assert.equal(res.body.task.id, id);
    assert.ok(Array.isArray(res.body.messages));
    assert.ok(Array.isArray(res.body.results));
    const missing = await request(app).get('/api/taskbus/task/does-not-exist');
    assert.equal(missing.status, 404);
  });

  test('PATCH /task/:id updates the task', async () => {
    const created = await request(app).post('/api/taskbus/task').send({ title: 'patch me', instruction: 'x', automation_mode: 'manual' });
    const id = created.body.task.id;
    const res = await request(app).patch('/api/taskbus/task/' + id).send({ priority: 'high' });
    assert.equal(res.status, 200);
    assert.equal(res.body.task.priority, 'high');
  });

  test('POST /task/:id/result trusts a real-AI flag only when provider is non-manual', async () => {
    const created = await request(app).post('/api/taskbus/task').send({ title: 'result test', instruction: 'x', automation_mode: 'manual' });
    const id = created.body.task.id;
    const trusted = await request(app).post('/api/taskbus/task/' + id + '/result').send({
      provider_used: 'deepseek', is_real_ai_result: true, output: 'out', summary: 'sum',
    });
    assert.equal(trusted.status, 200);
    assert.equal(trusted.body.result.is_real_ai_result, true);
    const manual = await request(app).post('/api/taskbus/task/' + id + '/result').send({
      provider_used: 'manual', is_real_ai_result: true, output: 'out2',
    });
    assert.equal(manual.status, 200);
    assert.equal(manual.body.result.is_real_ai_result, false);
  });

  test('POST /task/:id/message stores a message', async () => {
    const created = await request(app).post('/api/taskbus/task').send({ title: 'msg', instruction: 'x', automation_mode: 'manual' });
    const id = created.body.task.id;
    const res = await request(app).post('/api/taskbus/task/' + id + '/message').send({ from_agent: 'a', to_agent: 'b', content: 'hi' });
    assert.equal(res.status, 200);
    assert.equal(res.body.message.content, 'hi');
  });

  test('approval approve flow routes the task', async () => {
    const created = await request(app).post('/api/taskbus/task').send({ title: 'approve me', instruction: 'x', automation_mode: 'manual' });
    const id = created.body.task.id;
    const approval = store.createApproval(id, 'publish', { request_id: 'req-1' });
    const res = await request(app).post('/api/taskbus/approval/' + approval.id).send({ decision: 'approved' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.approval.status, 'approved');
    assert.equal(res.body.routeResult.status, 'completed');
  });

  test('approval reject does not route and unknown approval is 404', async () => {
    const created = await request(app).post('/api/taskbus/task').send({ title: 'reject me', instruction: 'x', automation_mode: 'manual' });
    const id = created.body.task.id;
    const approval = store.createApproval(id, 'publish', {});
    const rejected = await request(app).post('/api/taskbus/approval/' + approval.id).send({ decision: 'rejected', notes: 'nope' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.approval.status, 'rejected');
    const missing = await request(app).post('/api/taskbus/approval/not-an-id').send({ decision: 'approved' });
    assert.equal(missing.status, 404);
  });

  test('retry routes a failed task and rejects a non-failed one', async () => {
    const created = await request(app).post('/api/taskbus/task').send({ title: 'retry me', instruction: 'x', automation_mode: 'manual' });
    const id = created.body.task.id;
    store.updateTask(id, { status: 'failed', error: 'boom' });
    const ok = await request(app).post('/api/taskbus/task/' + id + '/retry');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.retried, id);
    assert.equal(ok.body.previous_status, 'failed');
    const conflicted = await request(app).post('/api/taskbus/task/' + id + '/retry');
    assert.equal(conflicted.status, 409);
  });

  test('GET /results lists with limit', async () => {
    const res = await request(app).get('/api/taskbus/results');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.results));
  });

  test('workflow endpoints', async () => {
    const list = await request(app).get('/api/taskbus/workflows');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.workflows));

    const missing = await request(app).post('/api/taskbus/workflow/run').send({});
    assert.equal(missing.status, 400);

    const run = await request(app).post('/api/taskbus/workflow/run').send({ workflow: 'test-wf' });
    assert.equal(run.status, 200);
    assert.equal(run.body.workflow, 'test-wf');

    const parMissing = await request(app).post('/api/taskbus/workflow/run/parallel').send({ workflows: [] });
    assert.equal(parMissing.status, 400);

    const par = await request(app).post('/api/taskbus/workflow/run/parallel').send({ workflows: ['a', 'b'] });
    assert.equal(par.status, 200);
    assert.equal(par.body.launched, 2);

    const health = await request(app).get('/api/taskbus/workflow/outreach-crm/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.health.ok, true);

    const poller = await request(app).post('/api/taskbus/workflow/outreach-crm/poller/run');
    assert.equal(poller.status, 200);
    assert.equal(poller.body.success, true);
  });
});
