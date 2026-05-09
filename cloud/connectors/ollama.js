// cloud/connectors/ollama.js
// Ollama local LLM connector — free, runs on Shayan's machine
// Install: https://ollama.ai | Models: ollama pull llama3.1
'use strict';

const axios = require('axios');
const { log } = require('../utils/logger.js');

const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL    = process.env.OLLAMA_MODEL    || 'llama3.1';
function sanitizeError(err) {
  const raw = typeof err === 'string' ? err : (err && err.message) || 'Ollama request failed';
  return raw
    .replace(/(api[_-]?key|token|secret|password)["':=\s]+[^"',\s}]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .slice(0, 180);
}
const TIMEOUT  = 120000; // 2 min — local models can be slow

// ── Health check ──────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await axios.get(BASE_URL + '/api/tags', { timeout: 5000 });
    const models = (res.data.models || []).map(function(m) { return m.name; });
    const modelAvailable = models.some(function(m) { return m.startsWith(MODEL.split(':')[0]); });
    return {
      running:         true,
      base_url:        BASE_URL,
      model:           MODEL,
      model_available: modelAvailable,
      available_models: models,
      status:          modelAvailable ? 'ready' : 'model_missing',
      message:         modelAvailable
        ? 'Ollama running, model ' + MODEL + ' available'
        : 'Ollama running but model ' + MODEL + ' not found. Run: ollama pull ' + MODEL,
    };
  } catch(e) {
    return {
      running:         false,
      base_url:        BASE_URL,
      model:           MODEL,
      model_available: false,
      available_models: [],
      status:          'offline',
      message:         'Ollama not running at ' + BASE_URL + '. Install: https://ollama.ai',
      error:           sanitizeError(e),
    };
  }
}

// ── Generate ──────────────────────────────────────────────────────────────────
async function generate(prompt, systemPrompt) {
  const health = await checkHealth();
  if (!health.running)         return { success: false, error: 'Ollama offline: ' + health.message };
  if (!health.model_available) return { success: false, error: 'Model missing: ' + health.message };

  log('[ollama] Generating with model:', MODEL);
  try {
    const res = await axios.post(BASE_URL + '/api/chat', {
      model:  MODEL,
      stream: false,
      messages: [
        systemPrompt ? { role: 'system', content: systemPrompt } : null,
        { role: 'user', content: prompt },
      ].filter(Boolean),
      options: { temperature: 0.3, num_predict: 2000 },
    }, { timeout: TIMEOUT });

    var raw = (res.data.message && res.data.message.content) || res.data.response || '';
    return { success: true, text: raw };
  } catch(e) {
    var err = sanitizeError(e.response ? JSON.stringify(e.response.data) : e);
    log('[ollama] Generate failed:', err);
    return { success: false, error: err };
  }
}

module.exports = { generate, checkHealth, BASE_URL, MODEL };
