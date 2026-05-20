'use strict';
// cloud/integrations/meta.js
// Meta/Instagram API connector for ACC v2
// ALL posts require Telegram approval before executing

var axios = require('axios');
var crypto = require('crypto');

var ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN || '';
var PAGE_ID       = process.env.META_PAGE_ID || '';
var IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '';
var VERIFY_TOKEN  = process.env.META_WEBHOOK_VERIFY_TOKEN || 'acc_webhook_2026';
var APP_SECRET    = process.env.META_WEBHOOK_APP_SECRET || process.env.META_APP_SECRET || '';
var GRAPH         = 'https://graph.facebook.com/v18.0';

if (!ACCESS_TOKEN) console.warn('[meta] META_ACCESS_TOKEN not set — connector disabled. Get from: developers.facebook.com');

function enabled() { return !!ACCESS_TOKEN; }

function headers() { return { 'Content-Type': 'application/json' }; }

function withToken(params) { return Object.assign({ access_token: ACCESS_TOKEN }, params || {}); }

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'Set META_ACCESS_TOKEN. Get at: developers.facebook.com → Your App → Graph API Explorer' };
  try {
    var r = await axios.get(GRAPH + '/me', { params: withToken({ fields: 'id,name' }), timeout: 8000 });
    return { status: 'connected', page: r.data.name, id: r.data.id };
  } catch(e) { return { status: 'error', error: e.response ? e.response.data : e.message }; }
}

// Post to Instagram (image post)
async function postToInstagram(imageUrl, caption) {
  if (!enabled() || !IG_ACCOUNT_ID) return { success: false, error: 'INSTAGRAM_BUSINESS_ACCOUNT_ID or META_ACCESS_TOKEN not set' };
  try {
    // Step 1: Create container
    var container = await axios.post(GRAPH + '/' + IG_ACCOUNT_ID + '/media', null, {
      params: withToken({ image_url: imageUrl, caption: caption }),
      timeout: 15000,
    });
    var creationId = container.data.id;
    // Step 2: Publish
    var publish = await axios.post(GRAPH + '/' + IG_ACCOUNT_ID + '/media_publish', null, {
      params: withToken({ creation_id: creationId }),
      timeout: 15000,
    });
    return { success: true, post_id: publish.data.id, platform: 'instagram' };
  } catch(e) { return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message }; }
}

// Post to Facebook page
async function postToFacebook(message, imageUrl) {
  if (!enabled() || !PAGE_ID) return { success: false, error: 'META_PAGE_ID or META_ACCESS_TOKEN not set' };
  try {
    var endpoint = imageUrl ? '/photos' : '/feed';
    var params = withToken({ message: message });
    if (imageUrl) params.url = imageUrl;
    var r = await axios.post(GRAPH + '/' + PAGE_ID + endpoint, null, { params: params, timeout: 15000 });
    return { success: true, post_id: r.data.id, platform: 'facebook' };
  } catch(e) { return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message }; }
}

// Get post insights
async function getInsights(postId, metrics) {
  if (!enabled()) return { success: false, error: 'META_ACCESS_TOKEN not set' };
  try {
    var m = (metrics || ['impressions','reach','likes']).join(',');
    var r = await axios.get(GRAPH + '/' + postId + '/insights', { params: withToken({ metric: m }), timeout: 10000 });
    return { success: true, insights: r.data.data };
  } catch(e) { return { success: false, error: e.message }; }
}

// Verify webhook signature
function verifyWebhook(signature, body) {
  if (!APP_SECRET) return true; // skip verification if no secret
  var expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return signature === expected;
}

// Handle webhook verification (GET) or events (POST)
function handleWebhook(query, body, signature) {
  if (query && query['hub.mode'] === 'subscribe') {
    if (query['hub.verify_token'] === VERIFY_TOKEN) return { verified: true, challenge: query['hub.challenge'] };
    return { verified: false };
  }
  if (!verifyWebhook(signature, JSON.stringify(body||{}))) return { verified: false, error: 'Invalid signature' };
  return { verified: true, events: body };
}

// ACC Task Bus adapter
async function sendTaskFromACC(accTask) {
  if (!enabled()) return { success: false, error: 'META_ACCESS_TOKEN not set. See .env.example for setup instructions.' };
  var instruction = (accTask.instruction || accTask.title || '').toLowerCase();
  // Parse: "post to instagram: [image url] caption: [text]" or "share to facebook: [message]"
  var isInstagram = /instagram/i.test(instruction);
  var isFacebook  = /facebook/i.test(instruction);
  var urlMatch    = instruction.match(/https?:\/\/[^\s]+/);
  var imageUrl    = urlMatch ? urlMatch[0] : null;
  var caption     = instruction.replace(/post to (instagram|facebook):?\s*/i,'').replace(imageUrl||'','').replace(/caption:?\s*/i,'').trim();
  if (isInstagram && imageUrl) return postToInstagram(imageUrl, caption);
  if (isFacebook) return postToFacebook(caption || instruction, imageUrl);
  return { success: false, error: 'Could not parse Meta action. Use: "post to instagram: [image_url] caption: [text]"' };
}

module.exports = { enabled, checkHealth, postToInstagram, postToFacebook, getInsights, handleWebhook, sendTaskFromACC };
