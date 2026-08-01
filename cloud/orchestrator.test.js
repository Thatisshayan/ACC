'use strict';
// cloud/orchestrator.test.js — task-graph builder (pure function, no side
// effects). Covers the realistic happy path: a command becomes a linear
// 3-node graph with the expected dependency chain and agent roles.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTaskGraph } = require('./orchestrator.js');

test('buildTaskGraph returns a linear 3-node graph embedding the command', () => {
  const graph = buildTaskGraph('Build a login page', 'MyProject');
  assert.equal(graph.length, 3);

  assert.equal(graph[0].id, 'T1');
  assert.equal(graph[0].assigned_agent_role, 'architect');
  assert.deepEqual(graph[0].dependencies, []);
  assert.match(graph[0].description, /Build a login page/);

  assert.equal(graph[1].id, 'T2');
  assert.equal(graph[1].assigned_agent_role, 'writer');
  assert.deepEqual(graph[1].dependencies, ['T1']);
  assert.match(graph[1].description, /Build a login page/);

  assert.equal(graph[2].id, 'T3');
  assert.equal(graph[2].assigned_agent_role, 'engineer');
  assert.deepEqual(graph[2].dependencies, ['T2']);
});

test('buildTaskGraph works without an explicit projectName (defaults apply)', () => {
  const graph = buildTaskGraph('Ship the feature');
  assert.equal(graph.length, 3);
  assert.match(graph[0].description, /Ship the feature/);
});
