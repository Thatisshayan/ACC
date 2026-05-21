'use strict';
// cloud/integrations/imageGen.js
// Multi-provider image generation: DALL-E 3 → Alibaba Wanx → Stability AI

var axios = require('axios');
var OPENAI_KEY    = process.env.OPENAI_API_KEY || '';
var ALIBABA_KEY   = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '';
var STABILITY_KEY = process.env.STABILITY_API_KEY || '';

function enabled() { return !!(OPENAI_KEY || ALIBABA_KEY || STABILITY_KEY); }

async function checkHealth() {
  return {
    status: enabled() ? 'available' : 'disabled',
    providers: {
      dalle3:    !!OPENAI_KEY,
      alibaba_wanx: !!ALIBABA_KEY,
      stability: !!STABILITY_KEY,
    }
  };
}

// Provider 1: DALL-E 3 (OpenAI)
async function generateDallE(prompt) {
  try {
    var r = await axios.post('https://api.openai.com/v1/images/generations', {
      model: 'dall-e-3', prompt: prompt.slice(0, 900), n: 1, size: '1024x1024',
    }, { headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' }, timeout: 60000 });
    return { success: true, url: r.data.data[0].url, revised_prompt: r.data.data[0].revised_prompt, provider: 'dall-e-3' };
  } catch(e) {
    var errMsg = e.response&&e.response.data ? JSON.stringify(e.response.data).slice(0,200) : e.message;
    console.warn('[imageGen] DALL-E failed:', errMsg);
    return { success: false, error: errMsg };
  }
}

// Provider 2: Alibaba Wanx
async function generateWanx(prompt) {
  try {
    var r = await axios.post('https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations', {
      model: 'wanx-v1', prompt: prompt, n: 1, size: '1024x1024',
    }, { headers: { Authorization: 'Bearer ' + ALIBABA_KEY, 'Content-Type': 'application/json' }, timeout: 90000 });
    var url = r.data.data && r.data.data[0] && r.data.data[0].url;
    return { success: true, url: url, provider: 'alibaba-wanx' };
  } catch(e) { return { success: false, error: e.message }; }
}

// Provider 3: Stability AI
async function generateStability(prompt) {
  try {
    var r = await axios.post('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      { text_prompts: [{ text: prompt, weight: 1 }], samples: 1, width: 1024, height: 1024 },
      { headers: { Authorization: 'Bearer ' + STABILITY_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 60000 });
    var b64 = r.data.artifacts[0].base64;
    return { success: true, base64: b64, provider: 'stability-xl', url: 'data:image/png;base64,' + b64 };
  } catch(e) { return { success: false, error: e.message }; }
}

// Main: try providers in order
async function generate(prompt, options) {
  if (OPENAI_KEY) {
    var d = await generateDallE(prompt);
    if (d.success) return d;
  }
  if (ALIBABA_KEY) {
    var w = await generateWanx(prompt);
    if (w.success) return w;
  }
  if (STABILITY_KEY) {
    var s = await generateStability(prompt);
    if (s.success) return s;
  }
  return { success: false, error: 'No image provider available. Set OPENAI_API_KEY, ALIBABA_API_KEY, or STABILITY_API_KEY' };
}

async function sendTaskFromACC(accTask) {
  if (!enabled()) return { success: false, error: 'No image generation API key set. Add OPENAI_API_KEY or ALIBABA_API_KEY to .env' };
  var instruction = accTask.instruction || accTask.title || '';
  var prompt = instruction.replace(/^(image:|generate:|generate image:|draw:|create image:)\s*/i, '').trim();
  if (!prompt) return { success: false, error: 'No prompt provided. Send: image: a cat on the moon' };
  var result = await generate(prompt);
  return Object.assign(result, {
    output: result.success ? 'Image generated! Provider: ' + result.provider + '\nURL: ' + (result.url||'base64 data') : result.error,
    summary: result.success ? 'Image generated via ' + result.provider : 'Image generation failed'
  });
}

module.exports = { enabled, checkHealth, generate, generateDallE, generateWanx, sendTaskFromACC };
