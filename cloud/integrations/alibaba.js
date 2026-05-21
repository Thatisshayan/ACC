'use strict';
// cloud/integrations/alibaba.js
// Alibaba Cloud Model Studio (Qwen) connector — OpenAI-compatible API
// Get API key: alibabacloud.com → Model Studio → API Keys
// $3/month AI Coding Plan or pay-per-token (qwen-turbo: $0.05/1M tokens)

var axios = require('axios');
var BASE  = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
var KEY   = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '';

if (!KEY) console.warn('[alibaba] ALIBABA_API_KEY not set. Get at: alibabacloud.com → Model Studio → API Keys');

function enabled() { return !!KEY; }

function h() { return { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }; }

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'Set ALIBABA_API_KEY. Get at alibabacloud.com → Model Studio' };
  try {
    var r = await axios.get(BASE + '/models', { headers: h(), timeout: 8000 });
    return { status: 'connected', models: (r.data.data||[]).length };
  } catch(e) { return { status: 'error', error: e.response ? e.response.status : e.message }; }
}

async function chat(prompt, model) {
  if (!enabled()) return { success: false, error: 'ALIBABA_API_KEY not set' };
  try {
    var r = await axios.post(BASE + '/chat/completions', {
      model: model || 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    }, { headers: h(), timeout: 30000 });
    var out = r.data.choices[0].message.content;
    return { success: true, output: out, model: model || 'qwen-plus', provider: 'alibaba' };
  } catch(e) { return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message }; }
}

async function generateImage(prompt) {
  if (!enabled()) return { success: false, error: 'ALIBABA_API_KEY not set' };
  try {
    var r = await axios.post(BASE + '/images/generations', {
      model: 'wanx-v1',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    }, { headers: h(), timeout: 60000 });
    var url = r.data.data && r.data.data[0] && r.data.data[0].url;
    return { success: true, url: url, provider: 'alibaba/wanx' };
  } catch(e) { return { success: false, error: e.message }; }
}

async function analyzeImage(imageUrl, prompt) {
  if (!enabled()) return { success: false, error: 'ALIBABA_API_KEY not set' };
  try {
    var r = await axios.post(BASE + '/chat/completions', {
      model: 'qwen-vl-max',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt || 'Describe this image' }
      ]}],
    }, { headers: h(), timeout: 30000 });
    return { success: true, output: r.data.choices[0].message.content };
  } catch(e) { return { success: false, error: e.message }; }
}

async function sendTaskFromACC(accTask) {
  var instruction = accTask.instruction || accTask.title || '';
  if (/image|generate|draw|create.*visual/i.test(instruction)) return generateImage(instruction);
  if (/analyze.*image|image.*analyze|vision/i.test(instruction)) return { success: false, error: 'Provide image URL for analysis' };
  return chat(instruction, 'qwen-plus');
}

module.exports = { enabled, checkHealth, chat, generateImage, analyzeImage, sendTaskFromACC };
