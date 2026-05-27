'use strict';
// cloud/autonomy/routes.js — REST API for autonomous loop engine
// Mount at: app.use('/api/autonomy', require('./autonomy/routes'))

const express = require('express');
const router  = express.Router();
const loop    = require('./loop.js');

// GET  /api/autonomy/loops          — list all loops
// POST /api/autonomy/loops          — create a loop
// GET  /api/autonomy/loops/:id      — get one loop
// PATCH /api/autonomy/loops/:id     — update (enable/disable/change interval)
// DELETE /api/autonomy/loops/:id    — delete
// POST /api/autonomy/loops/:id/run  — run immediately
// GET  /api/autonomy/stats          — engine stats

router.get('/loops', function(req, res) {
  var loops = loop.getAllLoops();
  return res.json({ success: true, total: loops.length, loops });
});

router.post('/loops', function(req, res) {
  try {
    var l = loop.createLoop(req.body || {});
    return res.json({ success: true, loop: l });
  } catch(e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/loops/:id', function(req, res) {
  var l = loop.getLoop(req.params.id);
  if (!l) return res.status(404).json({ success: false, error: 'Loop not found' });
  return res.json({ success: true, loop: l });
});

router.patch('/loops/:id', function(req, res) {
  var b = req.body || {};
  if (b.enabled === true)  { var l1 = loop.enableLoop(req.params.id);  return res.json({ success: !!l1, loop: l1 }); }
  if (b.enabled === false) { var l2 = loop.disableLoop(req.params.id); return res.json({ success: !!l2, loop: l2 }); }
  var l3 = loop.updateLoop(req.params.id, b);
  if (!l3) return res.status(404).json({ success: false, error: 'Loop not found' });
  return res.json({ success: true, loop: l3 });
});

router.delete('/loops/:id', function(req, res) {
  var ok = loop.deleteLoop(req.params.id);
  return res.json({ success: ok });
});

router.post('/loops/:id/run', async function(req, res) {
  var l = loop.getLoop(req.params.id);
  if (!l) return res.status(404).json({ success: false, error: 'Loop not found' });
  res.json({ success: true, message: 'Running now: ' + l.name });
  loop.runNow(req.params.id); // fire and forget
});

router.get('/stats', function(req, res) {
  return res.json({ success: true, stats: loop.stats() });
});

module.exports = router;
