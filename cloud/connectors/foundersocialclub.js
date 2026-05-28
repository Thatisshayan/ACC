'use strict';
// cloud/connectors/foundersocialclub.js
// Founder Social Club — ACC connector scaffold
// Replace FSC_BASE_URL with the live Buildy deployment URL when ready

const axios = require('axios');

const BASE_URL = (process.env.FSC_BASE_URL || '').replace(/\/$/, '');
const API_KEY  = process.env.FSC_API_KEY || '';

function enabled() { return !!BASE_URL; }
function headers() { return { 'Content-Type': 'application/json', ...(API_KEY ? { Authorization: 'Bearer ' + API_KEY } : {}) }; }

async function checkHealth() {
  if (!enabled()) return { status: 'setup_required', note: 'Set FSC_BASE_URL in .env' };
  try {
    var r = await axios.get(BASE_URL + '/api/health', { headers: headers(), timeout: 8000 });
    return { status: 'connected', service: 'founder-social-club', data: r.data };
  } catch(e) {
    return { status: 'error', error: e.message };
  }
}

// ── Content Generation ────────────────────────────────────────────────────────

async function generateContent(opts) {
  // opts: { idea, platform, format, tone, pillar, business_context, brand_profile? }
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.post(BASE_URL + '/functions/generate-content', opts, { headers: headers(), timeout: 30000 });
    return { success: true, draft: r.data };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

async function generateImage(opts) {
  // opts: { visual_prompt, style? }
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.post(BASE_URL + '/functions/generate-image', opts, { headers: headers(), timeout: 60000 });
    return { success: true, image_url: r.data.image_url };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

async function generateVideo(opts) {
  // opts: { image_url, prompt }
  // Uses Replicate wavespeed-ai/wan-2.2-i2v-480p internally
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.post(BASE_URL + '/functions/generate-video', opts, { headers: headers(), timeout: 180000 });
    return { success: true, video_url: r.data.video_url };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

async function generateNarration(opts) {
  // opts: { text }
  // Uses Replicate lucataco/xtts-v2 internally
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.post(BASE_URL + '/functions/generate-narration', opts, { headers: headers(), timeout: 120000 });
    return { success: true, audio_url: r.data.audio_url };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

// ── Publishing ────────────────────────────────────────────────────────────────

async function publishPost(opts) {
  // opts: { platform, caption, image_url, video_url?, format }
  // platform: 'instagram' | 'facebook'
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.post(BASE_URL + '/functions/publish-social', opts, { headers: headers(), timeout: 60000 });
    return { success: true, post_id: r.data.post_id, permalink: r.data.permalink };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

async function getInsights() {
  // Returns Instagram business account insights (reach, plays, engagement)
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.get(BASE_URL + '/functions/get-instagram-insights', { headers: headers(), timeout: 15000 });
    return { success: true, totals: r.data.totals, media: r.data.media };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

// ── Drafts ────────────────────────────────────────────────────────────────────

async function listDrafts(filters) {
  // filters: { platform?, status?, pillar? }
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.get(BASE_URL + '/api/drafts', { headers: headers(), params: filters || {}, timeout: 10000 });
    return { success: true, drafts: r.data.drafts || r.data };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

async function getDraft(id) {
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.get(BASE_URL + '/api/drafts/' + id, { headers: headers(), timeout: 10000 });
    return { success: true, draft: r.data };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

async function createDraft(draft) {
  // draft: SocialContentDraft shape
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.post(BASE_URL + '/api/drafts', draft, { headers: headers(), timeout: 10000 });
    return { success: true, draft: r.data };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

async function updateDraft(id, patch) {
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.patch(BASE_URL + '/api/drafts/' + id, patch, { headers: headers(), timeout: 10000 });
    return { success: true, draft: r.data };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

// ── Brand Profile ─────────────────────────────────────────────────────────────

async function getBrandProfile() {
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.get(BASE_URL + '/api/brand-profile', { headers: headers(), timeout: 10000 });
    return { success: true, profile: r.data };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

async function updateBrandProfile(profile) {
  // profile: BrandProfile shape
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.put(BASE_URL + '/api/brand-profile', profile, { headers: headers(), timeout: 10000 });
    return { success: true, profile: r.data };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

// ── Trend Radar ───────────────────────────────────────────────────────────────

async function getTrends(opts) {
  // opts: { niche, keywords }
  if (!enabled()) return { success: false, error: 'FSC_BASE_URL not set' };
  try {
    var r = await axios.post(BASE_URL + '/functions/trend-radar', opts, { headers: headers(), timeout: 30000 });
    return { success: true, trends: r.data.trends };
  } catch(e) { return { success: false, error: e.response?.data?.error || e.message }; }
}

module.exports = {
  enabled, checkHealth,
  generateContent, generateImage, generateVideo, generateNarration,
  publishPost,
  getInsights,
  listDrafts, getDraft, createDraft, updateDraft,
  getBrandProfile, updateBrandProfile,
  getTrends,
};
