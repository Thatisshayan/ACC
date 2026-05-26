'use strict';
// cloud/integrations/replicate.js
// Replicate video helper for Telegram previews and Task Bus automation.

var axios = require('axios');

var TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '';
var MODEL = process.env.REPLICATE_VIDEO_MODEL || 'bytedance/seedance-1-lite';
var WAIT_SECONDS = Math.max(5, parseInt(process.env.REPLICATE_VIDEO_WAIT_SECONDS || '45', 10) || 45);
var BASE = 'https://api.replicate.com/v1';

function enabled() {
  return !!TOKEN;
}

async function checkHealth() {
  return {
    status: enabled() ? 'available' : 'disabled',
    model: MODEL,
    token_set: enabled(),
  };
}

function authHeaders() {
  return {
    Authorization: 'Bearer ' + TOKEN,
    'Content-Type': 'application/json',
  };
}

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function clampInt(value, min, max, fallback) {
  var n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function pickOutputUrl(output) {
  if (!output) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    for (var i = 0; i < output.length; i++) {
      var item = output[i];
      if (typeof item === 'string' && item) return item;
      if (item && typeof item === 'object') {
        if (item.url) return String(item.url);
        if (item.href) return String(item.href);
      }
    }
    return '';
  }
  if (typeof output === 'object') {
    if (output.url) return String(output.url);
    if (output.href) return String(output.href);
    if (output.output) return pickOutputUrl(output.output);
  }
  return '';
}

async function createPrediction(input) {
  var response = await axios.post(BASE + '/models/' + MODEL + '/predictions', { input: input }, {
    headers: Object.assign({ Prefer: 'wait=' + WAIT_SECONDS }, authHeaders()),
    timeout: (WAIT_SECONDS + 15) * 1000,
  });
  return response.data;
}

async function getPrediction(url) {
  var response = await axios.get(url, { headers: authHeaders(), timeout: 30000 });
  return response.data;
}

async function waitForPrediction(prediction) {
  var current = prediction;
  var deadline = Date.now() + (WAIT_SECONDS * 1000);
  var pollUrl = current && current.urls && current.urls.get;
  while (current && ['starting', 'processing', 'queued'].indexOf(current.status) !== -1 && pollUrl && Date.now() < deadline) {
    await delay(4000);
    current = await getPrediction(pollUrl);
  }
  return current;
}

async function generateVideo(prompt, options) {
  if (!enabled()) {
    return { success: false, error: 'No Replicate token set. Add REPLICATE_API_TOKEN or REPLICATE_API_KEY to .env', provider: MODEL };
  }

  var input = {
    prompt: String(prompt || '').trim().slice(0, 1200),
    duration: clampInt(options && options.duration, 4, 12, 5),
    resolution: (options && options.resolution) || '720p',
    aspect_ratio: (options && options.aspect_ratio) || '16:9',
    fps: clampInt(options && options.fps, 1, 60, 24),
    camera_fixed: !!(options && options.camera_fixed),
  };

  if (!input.prompt) {
    return { success: false, error: 'No prompt provided for video generation.', provider: MODEL };
  }

  try {
    var created = await createPrediction(input);
    var finished = await waitForPrediction(created);
    var outputUrl = pickOutputUrl(finished && finished.output);
    var webUrl = finished && finished.urls && finished.urls.web;

    if (finished && finished.status === 'succeeded' && outputUrl) {
      return {
        success: true,
        provider: MODEL,
        status: finished.status,
        prediction_id: finished.id,
        video_url: outputUrl,
        web_url: webUrl,
        output: finished.output,
        summary: 'Replicate video generated successfully',
      };
    }

    return {
      success: false,
      provider: MODEL,
      status: finished && finished.status || 'unknown',
      prediction_id: finished && finished.id,
      web_url: webUrl,
      output: finished && finished.output,
      error: 'Replicate prediction ' + (finished && finished.status || 'unknown') + (webUrl ? ' - check ' + webUrl : ''),
      summary: 'Replicate video not finished',
    };
  } catch (e) {
    var detail = e.response && e.response.data ? JSON.stringify(e.response.data).slice(0, 400) : e.message;
    return {
      success: false,
      provider: MODEL,
      error: detail,
      summary: 'Replicate video generation failed',
    };
  }
}

async function sendTaskFromACC(accTask) {
  var instruction = String((accTask && (accTask.instruction || accTask.title)) || '').trim();
  var prompt = instruction.replace(/^(video:|generate video:|video generator:|replicate video:)\s*/i, '').trim();
  if (!prompt) {
    return { success: false, error: 'No video prompt provided. Try: video: a cinematic intro for my channel', provider: MODEL };
  }
  return generateVideo(prompt, {
    duration: 5,
    resolution: '720p',
    aspect_ratio: '16:9',
    fps: 24,
    camera_fixed: false,
  });
}

module.exports = {
  enabled,
  checkHealth,
  generateVideo,
  sendTaskFromACC,
};
