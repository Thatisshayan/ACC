'use strict';
// cloud/api/synapseRoutes.js — Synapse multi-agent API
// Mount at: app.use('/api/synapse', require('./api/synapseRoutes'))

const express = require('express');
const router  = express.Router();
const synapse = require('../integrations/synapse.js');

// GET /api/synapse/status — check which agents are available
router.get('/status', function(req, res) {
  return res.json({
    success: true,
    available_agents: Object.keys(synapse.MODEL_REGISTRY),
    presets: Object.keys(synapse.PRESETS),
    modes: ['default', 'compare', 'debate', 'synthesis', 'red-team', 'research', 'code-review'],
    keys: {
      anthropic: !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY),
      openai:    !!(process.env.SYNAPSE_API_KEY || process.env.OPENAI_API_KEY),
      google:    !!process.env.GEMINI_API_KEY,
      deepseek:  !!process.env.DEEPSEEK_API_KEY,
    },
  });
});

// POST /api/synapse/broadcast — fire a message to multiple agents
// Body: { message, agents?, preset?, roomContext?, roomName?, mode?, round?, history?, synthesize? }
router.post('/broadcast', async function(req, res) {
  var b = req.body || {};
  if (!b.message) return res.status(400).json({ success: false, error: 'message is required' });

  try {
    var result = await synapse.broadcast({
      message:     b.message,
      agents:      b.agents,
      preset:      b.preset || 'brainstorm',
      roomContext: b.roomContext || b.context || '',
      roomName:    b.roomName || b.name || 'ACC Room',
      mode:        b.mode || 'default',
      round:       b.round || 1,
      history:     b.history || [],
      synthesize:  b.synthesize !== false,
    });
    return res.json(result);
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/synapse/quick — fastest path: message + optional preset, returns synthesis only
router.post('/quick', async function(req, res) {
  var b = req.body || {};
  if (!b.message) return res.status(400).json({ success: false, error: 'message is required' });

  try {
    var result = await synapse.broadcast({
      message:    b.message,
      preset:     b.preset || 'quick',
      roomName:   'Quick Room',
      synthesize: true,
    });
    return res.json({
      success: true,
      message: b.message,
      synthesis: result.synthesis,
      agents_responded: result.successful,
      agents_failed: result.failed,
    });
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/synapse/presets — list presets and their agents
router.get('/presets', function(req, res) {
  var out = {};
  Object.keys(synapse.PRESETS).forEach(function(k) {
    out[k] = synapse.PRESETS[k].map(function(agentKey) {
      return { key: agentKey, name: synapse.MODEL_REGISTRY[agentKey]?.name };
    });
  });
  return res.json({ success: true, presets: out });
});

module.exports = router;
