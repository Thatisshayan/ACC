'use strict';
// cloud/taskbus/providerFallback.test.js
// Locks every provider path to the { tried, success, ... } shape contract:
// never bare null/undefined, never an uncaught throw past executeWithProviderFallback().

const { test, describe, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const perplexity = require('../integrations/perplexity.js');
const alibaba = require('../integrations/alibaba.js');
const ollama = require('../connectors/ollama.js');

const BASELINE = {
  PERPLEXITY_API_KEY: 'px-test-key',
  ALIBABA_API_KEY: 'ali-test-key',
  DEEPSEEK_API_KEY: 'ds-test-key',
  CLAUDE_API_KEY: 'claude-test-key',
  PROVIDER_FAIL_TTL_MS: '60000',
};

let providerFallback;

before(() => {
  Object.assign(process.env, BASELINE);
  delete process.env.TASKBUS_PROVIDER_ORDER;
  providerFallback = require('./providerFallback.js');
});

function resetEnv() {
  Object.keys(BASELINE).forEach((k) => { process.env[k] = BASELINE[k]; });
  delete process.env.TASKBUS_PROVIDER_ORDER;
}

function task(overrides) {
  return Object.assign({
    title: 'Test task',
    instruction: 'Do the thing',
    required_output: 'A result',
    feature_ref: 'core',
    priority: 'normal',
    automation_mode: 'semi_auto',
  }, overrides || {});
}

function assertShape(r) {
  assert.ok(r !== null && typeof r === 'object', 'result must be an object, got: ' + String(r));
  assert.equal(typeof r.tried, 'boolean', 'tried must be boolean');
  assert.equal(typeof r.success, 'boolean', 'success must be boolean');
}

describe('provider shape contract (Phase 2)', () => {
  beforeEach(() => { resetEnv(); providerFallback.clearProviderCache(); });
  afterEach(() => { mock.restoreAll(); resetEnv(); });

  // ── Perplexity ────────────────────────────────────────────────────────────
  test('tryPerplexity disabled path', async () => {
    mock.method(perplexity, 'enabled', () => false);
    const r = await providerFallback.tryPerplexity(task());
    assertShape(r);
    assert.equal(r.tried, false);
    assert.equal(r.success, false);
  });

  test('tryPerplexity success path', async () => {
    mock.method(perplexity, 'enabled', () => true);
    mock.method(perplexity, 'research', async () => ({ success: true, text: 'research answer', citations: ['https://example.com'] }));
    const r = await providerFallback.tryPerplexity(task({ feature_ref: 'research' }));
    assertShape(r);
    assert.equal(r.success, true);
    assert.equal(r.provider, 'perplexity');
    assert.ok(r.data.output.includes('research answer'));
  });

  test('tryPerplexity error path', async () => {
    mock.method(perplexity, 'enabled', () => true);
    mock.method(perplexity, 'research', async () => ({ success: false, error: 'rate limited', text: null }));
    const r = await providerFallback.tryPerplexity(task());
    assertShape(r);
    assert.equal(r.success, false);
    assert.ok(String(r.reason).length > 0);
  });

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  test('tryDeepSeek disabled path', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const r = await providerFallback.tryDeepSeek(task());
    assertShape(r);
    assert.equal(r.tried, false);
    assert.equal(r.success, false);
  });

  test('tryDeepSeek success path', async () => {
    mock.method(axios, 'post', async () => ({
      data: { choices: [{ message: { content: '{"summary":"ok","output":"deepseek out"}' } }] },
    }));
    const r = await providerFallback.tryDeepSeek(task());
    assertShape(r);
    assert.equal(r.success, true);
    assert.equal(r.provider, 'deepseek');
    assert.equal(r.data.output, 'deepseek out');
  });

  test('tryDeepSeek error path never throws', async () => {
    mock.method(axios, 'post', async () => { throw new Error('connection refused'); });
    const r = await providerFallback.tryDeepSeek(task());
    assertShape(r);
    assert.equal(r.success, false);
    assert.ok(String(r.reason).length > 0);
  });

  // ── Alibaba ───────────────────────────────────────────────────────────────
  test('tryAlibaba disabled path', async () => {
    mock.method(alibaba, 'enabled', () => false);
    const r = await providerFallback.tryAlibaba(task());
    assertShape(r);
    assert.equal(r.tried, false);
    assert.equal(r.success, false);
  });

  test('tryAlibaba success path carries output via data.output', async () => {
    mock.method(alibaba, 'enabled', () => true);
    mock.method(alibaba, 'chat', async () => ({ success: true, output: 'qwen output', model: 'qwen-plus' }));
    const r = await providerFallback.tryAlibaba(task());
    assertShape(r);
    assert.equal(r.success, true);
    assert.equal(r.provider, 'alibaba_qwen');
    assert.equal(r.data.output, 'qwen output');
    assert.equal(r.data.summary, 'qwen output');
  });

  test('tryAlibaba error path', async () => {
    mock.method(alibaba, 'enabled', () => true);
    mock.method(alibaba, 'chat', async () => ({ success: false, error: 'bad key' }));
    const r = await providerFallback.tryAlibaba(task());
    assertShape(r);
    assert.equal(r.success, false);
    assert.ok(String(r.reason).length > 0);
  });

  test('tryAlibaba throwing chat returns shape (regression)', async () => {
    mock.method(alibaba, 'enabled', () => true);
    mock.method(alibaba, 'chat', async () => { throw new Error('network down'); });
    const r = await providerFallback.tryAlibaba(task());
    assertShape(r);
    assert.equal(r.success, false);
  });

  // ── Ollama ────────────────────────────────────────────────────────────────
  test('tryOllama success path', async () => {
    mock.method(ollama, 'generate', async () => ({ success: true, text: '{"summary":"s","output":"ollama out"}' }));
    const r = await providerFallback.tryOllama(task());
    assertShape(r);
    assert.equal(r.success, true);
    assert.equal(r.provider, 'ollama');
    assert.equal(r.data.output, 'ollama out');
  });

  test('tryOllama error path', async () => {
    mock.method(ollama, 'generate', async () => ({ success: false, error: 'model missing' }));
    const r = await providerFallback.tryOllama(task());
    assertShape(r);
    assert.equal(r.success, false);
    assert.equal(r.reason, 'model missing');
  });

  test('tryOllama throwing generate returns shape (regression)', async () => {
    mock.method(ollama, 'generate', async () => { throw new Error('connection refused'); });
    const r = await providerFallback.tryOllama(task());
    assertShape(r);
    assert.equal(r.success, false);
    assert.ok(String(r.reason).includes('connection refused'));
  });

  test('tryOllama malformed (null) result returns shape (regression)', async () => {
    mock.method(ollama, 'generate', async () => null);
    const r = await providerFallback.tryOllama(task());
    assertShape(r);
    assert.equal(r.success, false);
  });

  // ── Claude ────────────────────────────────────────────────────────────────
  test('tryClaude disabled path', async () => {
    delete process.env.CLAUDE_API_KEY;
    const r = await providerFallback.tryClaude(task());
    assertShape(r);
    assert.equal(r.tried, false);
    assert.equal(r.success, false);
  });

  test('tryClaude success path', async () => {
    mock.method(axios, 'post', async () => ({
      data: { content: [{ text: '{"summary":"s","output":"claude out"}' }] },
    }));
    const r = await providerFallback.tryClaude(task());
    assertShape(r);
    assert.equal(r.success, true);
    assert.equal(r.provider, 'claude');
    assert.equal(r.data.output, 'claude out');
  });

  test('tryClaude error path never throws', async () => {
    mock.method(axios, 'post', async () => { throw new Error('timeout'); });
    const r = await providerFallback.tryClaude(task());
    assertShape(r);
    assert.equal(r.success, false);
    assert.ok(String(r.reason).length > 0);
  });

  // ── Fallback chain ────────────────────────────────────────────────────────
  test('research task routes through Perplexity first', async () => {
    process.env.TASKBUS_PROVIDER_ORDER = 'deepseek,smart_stub';
    mock.method(perplexity, 'enabled', () => true);
    mock.method(perplexity, 'research', async () => ({ success: true, text: 'research', citations: [] }));
    const r = await providerFallback.executeWithProviderFallback(task({ feature_ref: 'research' }));
    assert.equal(r.provider_used, 'perplexity');
    assert.equal(r.is_real_ai_result, true);
  });

  test('fallback chain survives failing + throwing providers and lands on smart stub', async () => {
    process.env.TASKBUS_PROVIDER_ORDER = 'deepseek,ollama,smart_stub';
    mock.method(axios, 'post', async () => { throw new Error('deepseek down'); });
    mock.method(ollama, 'generate', async () => { throw new Error('ollama down'); });
    const r = await providerFallback.executeWithProviderFallback(task());
    assert.equal(r.provider_used, 'smart_stub');
    assert.equal(r.is_real_ai_result, false);
    assert.ok(r.fallback_reason);
  });

  test('fallback chain with all-disabled providers still returns a result', async () => {
    process.env.TASKBUS_PROVIDER_ORDER = 'deepseek,alibaba,smart_stub';
    delete process.env.DEEPSEEK_API_KEY;
    mock.method(alibaba, 'enabled', () => false);
    const r = await providerFallback.executeWithProviderFallback(task());
    assert.equal(r.provider_used, 'smart_stub');
    assert.equal(r.is_real_ai_result, false);
  });

  test('malformed ollama result mid-chain never crashes the chain', async () => {
    process.env.TASKBUS_PROVIDER_ORDER = 'ollama,smart_stub';
    mock.method(ollama, 'generate', async () => null);
    const r = await providerFallback.executeWithProviderFallback(task());
    assert.equal(r.provider_used, 'smart_stub');
    assert.equal(r.is_real_ai_result, false);
  });
});
