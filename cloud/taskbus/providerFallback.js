// cloud/taskbus/providerFallback.js
// ACC v2 Provider Fallback Chain
// Order: DeepSeek → Ollama → Claude → Smart Stub
// Every result includes full provider metadata
// Safety controls NOT in this file — handled by router.js before calling here
'use strict';

const axios      = require('axios');
const { log }    = require('../utils/logger.js');
const ollama     = require('../connectors/ollama.js');
const { buildSmartStub } = require('./smartStub.js');

// ── Provider order from env or default ────────────────────────────────────────
var DEFAULT_ORDER = ['deepseek', 'ollama', 'claude', 'smart_stub'];
function getProviderOrder() {
  var env = process.env.TASKBUS_PROVIDER_ORDER;
  if (!env) return DEFAULT_ORDER;
  return env.split(',').map(function(p) { return p.trim().toLowerCase(); });
}

// ── Prompt builder ────────────────────────────────────────────────────────────
var SYSTEM_PROMPT = 'You are the ACC v2 AI execution engine (Senior Backend Engineer / Automation Lead).\nComplete the task. Be specific, practical, and safe.\nReturn ONLY valid JSON:\n{ "summary": "one sentence", "output": "full response", "files_changed": [], "risks": [], "next_request": "suggested next task for ChatGPT" }';

function buildUserPrompt(task) {
  return [
    'Task: '            + task.title,
    'Instruction: '     + task.instruction,
    'Required output: ' + (task.required_output || 'Analysis and recommendation'),
    'Feature ref: '     + (task.feature_ref || 'ACC v2 core'),
    'Priority: '        + (task.priority || 'normal'),
  ].join('\n');
}

function parseJSON(raw) {
  var clean = raw.replace(/```json\n?|```json5\n?|\n?```/g, '').trim();
  var s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s !== -1 && e !== -1) clean = clean.slice(s, e + 1);
  try { return JSON.parse(clean); }
  catch(_) { return { summary: 'AI responded (raw)', output: raw, files_changed: [], risks: [], next_request: '' }; }
}

function sanitizeProviderError(err) {
  var msg = String(err || 'provider unavailable');
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
  msg = msg.replace(/(api[_-]?key|x-api-key|authorization|token|secret|password)["':=\s]+[^"',\s}]+/gi, '$1=[redacted]');
  msg = msg.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted_key]');
  if (msg.length > 220) msg = msg.slice(0, 220) + '...';
  return msg;
}

// ── Provider 1: DeepSeek ──────────────────────────────────────────────────────
async function tryDeepSeek(task) {
  var key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { tried: false, reason: 'DEEPSEEK_API_KEY not set' };

  log('[provider] Trying DeepSeek...');
  try {
    var res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model:       'deepseek-chat',
      max_tokens:  2000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(task) },
      ],
    }, {
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    var parsed = parseJSON(res.data.choices[0].message.content);
    log('[provider] DeepSeek succeeded');
    return { tried: true, success: true, provider: 'deepseek', cost_tier: 'low_cost', data: parsed };
  } catch(e) {
    var err = sanitizeProviderError(e.response ? JSON.stringify(e.response.data) : e.message);
    log('[provider] DeepSeek failed:', err.slice(0, 120));
    return { tried: true, success: false, reason: err };
  }
}

// ── Provider 2: Ollama ────────────────────────────────────────────────────────
async function tryOllama(task) {
  log('[provider] Trying Ollama at', ollama.BASE_URL, 'model:', ollama.MODEL);
  var result = await ollama.generate(buildUserPrompt(task), SYSTEM_PROMPT);
  if (!result.success) {
    log('[provider] Ollama failed:', result.error.slice(0, 100));
    return { tried: true, success: false, reason: result.error };
  }
  var parsed = parseJSON(result.text);
  log('[provider] Ollama succeeded');
  return { tried: true, success: true, provider: 'ollama', cost_tier: 'local_free', data: parsed };
}

// ── Provider 3: Claude ────────────────────────────────────────────────────────
async function tryClaude(task) {
  var key = process.env.CLAUDE_API_KEY;
  if (!key) return { tried: false, reason: 'CLAUDE_API_KEY not set' };

  log('[provider] Trying Claude (premium fallback)...');
  try {
    var res = await axios.post('https://api.anthropic.com/v1/messages', {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildUserPrompt(task) }],
    }, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    var parsed = parseJSON(res.data.content[0].text);
    log('[provider] Claude succeeded');
    return { tried: true, success: true, provider: 'claude', cost_tier: 'premium', data: parsed };
  } catch(e) {
    var err = sanitizeProviderError(e.response ? JSON.stringify(e.response.data) : e.message);
    log('[provider] Claude failed:', err.slice(0, 120));
    return { tried: true, success: false, reason: err };
  }
}

// ── Provider 4: Smart Stub ────────────────────────────────────────────────────
function useSmartStub(task) {
  log('[provider] Using Smart Stub (all providers failed or unavailable)');
  var stub = buildSmartStub(task);
  return { tried: true, success: true, provider: 'smart_stub', cost_tier: 'zero_cost_stub', data: stub };
}

// ── Health check for all providers ───────────────────────────────────────────
async function getProvidersStatus() {
  var ollamaHealth = await ollama.checkHealth();
  return {
    deepseek: {
      name:      'DeepSeek',
      status:    process.env.DEEPSEEK_API_KEY ? 'key_set' : 'no_key',
      note:      process.env.DEEPSEEK_API_KEY
                   ? 'Key loaded — check balance at platform.deepseek.com'
                   : 'Add DEEPSEEK_API_KEY to .env',
      cost_tier: 'low_cost',
      role:      'primary',
    },
    ollama: {
      name:            'Ollama',
      status:          ollamaHealth.status,
      running:         ollamaHealth.running,
      model:           ollamaHealth.model,
      model_available: ollamaHealth.model_available,
      available_models: ollamaHealth.available_models,
      note:            ollamaHealth.message,
      cost_tier:       'local_free',
      role:            'local_fallback',
      install_cmd:     ollamaHealth.running && !ollamaHealth.model_available
                         ? 'ollama pull ' + ollama.MODEL
                         : ollamaHealth.running ? null : 'Download from https://ollama.ai',
    },
    claude: {
      name:      'Claude',
      status:    process.env.CLAUDE_API_KEY ? 'key_set' : 'no_key',
      note:      process.env.CLAUDE_API_KEY
                   ? 'Key loaded — check balance at console.anthropic.com'
                   : 'Add CLAUDE_API_KEY to .env',
      cost_tier: 'premium',
      role:      'premium_fallback',
    },
    smart_stub: {
      name:      'Smart Stub',
      status:    'always_available',
      note:      'Zero-cost pattern-based stub. Always returns structured result. Not real AI.',
      cost_tier: 'zero_cost_stub',
      role:      'final_fallback',
    },
  };
}

// ── Main fallback chain ────────────────────────────────────────────────────────
async function executeWithProviderFallback(task) {
  var order    = getProviderOrder();
  var attempted = [];
  var reasons  = {};

  for (var i = 0; i < order.length; i++) {
    var provider = order[i];
    var result;

    if (provider === 'deepseek') result = await tryDeepSeek(task);
    else if (provider === 'ollama') result = await tryOllama(task);
    else if (provider === 'claude') result = await tryClaude(task);
    else if (provider === 'smart_stub') result = useSmartStub(task);
    else continue;

    if (result.tried) attempted.push(provider);
    if (!result.tried) { log('[provider] Skipping', provider, '—', result.reason); continue; }
    if (!result.success) { reasons[provider] = result.reason; continue; }

    // Success — enrich with full metadata
    var data = result.data || {};
    return {
      provider_used:            result.provider,
      provider_chain_attempted: attempted,
      fallback_reason:          attempted.length > 1
        ? 'Tried: ' + attempted.slice(0, -1).join(', ') + '. Reasons: ' + JSON.stringify(reasons)
        : null,
      execution_mode:           task.automation_mode || 'semi_auto',
      cost_tier:                result.cost_tier,
      is_real_ai_result:        result.provider !== 'smart_stub',
      summary:                  data.summary       || '',
      output:                   data.output        || '',
      files_changed:            data.files_changed || [],
      risks:                    data.risks         || [],
      next_request:             data.next_request  || '',
    };
  }

  // Should never reach here — smart_stub is always last
  var stub = buildSmartStub(task);
  return Object.assign({ provider_used: 'smart_stub', provider_chain_attempted: attempted,
    fallback_reason: 'All providers failed: ' + sanitizeProviderError(JSON.stringify(reasons)),
    execution_mode: task.automation_mode, cost_tier: 'zero_cost_stub', is_real_ai_result: false }, stub);
}

module.exports = { executeWithProviderFallback, getProvidersStatus };
