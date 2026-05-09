// cloud/connectors/gemini.js
const { BaseConnector } = require('./baseConnector.js');
const fetch = require('node-fetch');

function sanitizeError(err) {
  const raw = typeof err === 'string' ? err : (err && err.message) || 'Gemini request failed';
  return raw
    .replace(/key=([^&\s]+)/gi, 'key=[redacted]')
    .replace(/(api[_-]?key|token|secret|password)["':=\s]+[^"',\s}]+/gi, '$1=[redacted]')
    .replace(/https:\/\/generativelanguage\.googleapis\.com\/[^\s"']+/gi, 'Gemini API endpoint')
    .slice(0, 180);
}

class GeminiConnector extends BaseConnector {
  constructor(config = {}) {
    super({ name: 'gemini', version: '1.0.0', apiKey: config.apiKey, enabled: config.enabled ?? true });
    if (!this.apiKey) console.warn('[gemini] Warning: GEMINI_API_KEY not set.');
  }

  async run(action, payload = {}) {
    const valid = this.validate();
    if (!valid.success) return valid;
    if (!this.apiKey) return { success: false, error: 'Missing GEMINI_API_KEY' };

    const prompt = payload.prompt || payload.query || payload.text || '';
    const model  = payload.model || 'gemini-1.5-flash';

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
          })
        }
      );
      const json = await res.json();
      if (!res.ok) return { success: false, error: sanitizeError(json.error?.message || 'Gemini API error') };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { success: true, output: text, model };
    } catch (e) {
      return { success: false, error: sanitizeError(e) };
    }
  }
}

module.exports = { GeminiConnector };
