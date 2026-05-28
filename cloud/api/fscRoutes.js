'use strict';
// cloud/api/fscRoutes.js — Founder Social Club API routes
// Mount at: app.use('/api/fsc', require('./api/fscRoutes'))

const express = require('express');
const router  = express.Router();
const fsc     = require('../connectors/foundersocialclub.js');

// GET  /api/fsc/status
router.get('/status', async (req, res) => {
  var health = await fsc.checkHealth();
  return res.json({ success: true, enabled: fsc.enabled(), health });
});

// POST /api/fsc/generate — full content generation pipeline
// Body: { idea, platform, format, tone, pillar?, business_context? }
router.post('/generate', async (req, res) => {
  var b = req.body || {};
  if (!b.idea) return res.status(400).json({ success: false, error: 'idea is required' });
  var result = await fsc.generateContent(b);
  return res.json(result);
});

// POST /api/fsc/image   — generate image from visual_prompt
router.post('/image', async (req, res) => {
  var b = req.body || {};
  if (!b.visual_prompt) return res.status(400).json({ success: false, error: 'visual_prompt is required' });
  var result = await fsc.generateImage(b);
  return res.json(result);
});

// POST /api/fsc/video   — animate image into video clip
router.post('/video', async (req, res) => {
  var b = req.body || {};
  if (!b.image_url || !b.prompt) return res.status(400).json({ success: false, error: 'image_url and prompt are required' });
  var result = await fsc.generateVideo(b);
  return res.json(result);
});

// POST /api/fsc/narration — generate voiceover from text
router.post('/narration', async (req, res) => {
  var b = req.body || {};
  if (!b.text) return res.status(400).json({ success: false, error: 'text is required' });
  var result = await fsc.generateNarration(b);
  return res.json(result);
});

// POST /api/fsc/publish — publish draft to Instagram/Facebook
router.post('/publish', async (req, res) => {
  var b = req.body || {};
  if (!b.platform || !b.caption) return res.status(400).json({ success: false, error: 'platform and caption are required' });
  var result = await fsc.publishPost(b);
  return res.json(result);
});

// GET  /api/fsc/insights — Instagram analytics
router.get('/insights', async (req, res) => {
  var result = await fsc.getInsights();
  return res.json(result);
});

// GET  /api/fsc/drafts
router.get('/drafts', async (req, res) => {
  var result = await fsc.listDrafts(req.query);
  return res.json(result);
});

// GET  /api/fsc/drafts/:id
router.get('/drafts/:id', async (req, res) => {
  var result = await fsc.getDraft(req.params.id);
  return res.json(result);
});

// POST /api/fsc/drafts
router.post('/drafts', async (req, res) => {
  var result = await fsc.createDraft(req.body || {});
  return res.json(result);
});

// PATCH /api/fsc/drafts/:id
router.patch('/drafts/:id', async (req, res) => {
  var result = await fsc.updateDraft(req.params.id, req.body || {});
  return res.json(result);
});

// GET  /api/fsc/brand
router.get('/brand', async (req, res) => {
  var result = await fsc.getBrandProfile();
  return res.json(result);
});

// PUT  /api/fsc/brand
router.put('/brand', async (req, res) => {
  var result = await fsc.updateBrandProfile(req.body || {});
  return res.json(result);
});

// POST /api/fsc/trends — trend radar
router.post('/trends', async (req, res) => {
  var b = req.body || {};
  if (!b.niche) return res.status(400).json({ success: false, error: 'niche is required' });
  var result = await fsc.getTrends(b);
  return res.json(result);
});

module.exports = router;
