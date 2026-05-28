'use strict';
// cloud/api/outreachRoutes.js — Outreach pipeline REST API
// Mount at: app.use('/api/outreach', require('./api/outreachRoutes'))

const express  = require('express');
const router   = express.Router();
const pipeline = require('../workflows/outreachPipeline.js');
const fs       = require('fs');
const path     = require('path');

// POST /api/outreach/run
// Body: { leads: [{ name, company, domain, role, notes? }] }
router.post('/run', async (req, res) => {
  const leads = req.body && req.body.leads;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ success: false, error: 'Provide leads array: [{ name, company, domain, role }]' });
  }
  if (leads.length > 50) {
    return res.status(400).json({ success: false, error: 'Max 50 leads per run.' });
  }
  try {
    res.json({ success: true, message: `Running pipeline for ${leads.length} lead(s)…`, started: true });
    pipeline.runPipeline(leads).catch(e => console.error('[outreach] pipeline error:', e.message));
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/outreach/lead — single lead
router.post('/lead', async (req, res) => {
  const lead = req.body;
  if (!lead || !lead.name || !lead.domain) {
    return res.status(400).json({ success: false, error: 'Provide: { name, company, domain, role }' });
  }
  try {
    const results = await pipeline.runSingleLead(lead);
    return res.json({ success: true, result: results[0] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/outreach/results — last run results
router.get('/results', (req, res) => {
  const file = path.join(__dirname, '..', '..', 'data', 'outreach-results.json');
  if (!fs.existsSync(file)) return res.json({ success: true, results: [], note: 'No runs yet.' });
  try {
    const results = JSON.parse(fs.readFileSync(file, 'utf8'));
    return res.json({ success: true, total: results.length, results });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/outreach/status — check if keys are configured
router.get('/status', (req, res) => {
  return res.json({
    success: true,
    hunter:   !!process.env.HUNTER_API_KEY,
    deepseek: !!process.env.DEEPSEEK_API_KEY,
    resend:   !!process.env.RESEND_API_KEY,
    ready:    !!(process.env.HUNTER_API_KEY && process.env.DEEPSEEK_API_KEY && process.env.RESEND_API_KEY),
  });
});

module.exports = router;
