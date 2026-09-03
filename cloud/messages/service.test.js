'use strict';
// Regression coverage for the 2026-09-03 code.run/agent.http admin-only gate
// (see docs/SECURITY_CODEEXEC.md). code.run itself is exercised end-to-end since it
// no longer touches codeExec.js at all (routed through cloud/utils/safeExpr.js instead).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { executeAssistantIntent, parseAssistantIntent } = require('./service.js');

describe('code.run / agent.http admin gate', () => {
  test('operator-role callers are rejected before anything executes', async () => {
    const result = await executeAssistantIntent({ userId: 'u1', role: 'operator', text: 'calculate 2+2' });
    assert.equal(result.success, false);
    assert.match(result.error, /admin privileges/);
  });

  test('callers with no role at all are rejected (fail closed)', async () => {
    const result = await executeAssistantIntent({ userId: 'u1', text: 'calculate 2+2' });
    assert.equal(result.success, false);
    assert.match(result.error, /admin privileges/);
  });

  test('admin-role callers can use code.run, evaluated via safeExpr (no vm)', async () => {
    const result = await executeAssistantIntent({ userId: 'u1', role: 'admin', text: 'calculate 12*(3+4)' });
    assert.equal(result.success, true);
    assert.equal(result.output, 84);
  });

  test('admin-role code.run rejects the documented vm-escape payload as an expression error, not code', async () => {
    const result = await executeAssistantIntent({
      userId: 'u1',
      role: 'admin',
      text: "run code: this.constructor.constructor('return process')()",
    });
    assert.equal(result.success, false);
    assert.match(result.error, /Couldn't evaluate that as a math expression/);
  });

  test('operator role is case-sensitive-safe but still denied for agent.http', async () => {
    const result = await executeAssistantIntent({ userId: 'u1', role: 'Operator', text: 'get url http://example.com' });
    assert.equal(result.success, false);
    assert.match(result.error, /admin privileges/);
  });
});

describe('intent parsing anchoring', () => {
  test('code.run only fires when the trigger phrase starts the message', () => {
    assert.equal(parseAssistantIntent('can you run this by me').intent, 'assistant.chat');
    assert.equal(parseAssistantIntent('calculate 12*3').intent, 'code.run');
  });

  test('agent.http only fires when the trigger phrase starts the message', () => {
    assert.equal(parseAssistantIntent('i need to get url for the file').intent, 'assistant.chat');
    assert.equal(parseAssistantIntent('get url http://example.com').intent, 'agent.http');
  });
});
