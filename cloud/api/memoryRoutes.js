'use strict';
// cloud/api/memoryRoutes.js — Agent memory REST API
// Mount: app.use('/api/memory', require('./api/memoryRoutes'))
//
// The mobile app and other clients use this to:
//   - Read agent context and facts
//   - Write facts after task completion
//   - Query memory by scope or keyword
//
// Uses SQLite as fast local store + Supabase for cloud persistence.

const express = require('express');
const router  = express.Router();
const { remember, recall, recallAll, search, logEvent, getEvents, stats } = require('../memory/store.js');
const { syncMemoryToSupabase, loadMemoryFromSupabase } = require('../storage/supabaseMemory.js');
const { log } = require('../utils/logger.js');

// GET /api/memory/stats
router.get('/stats', (req, res) => {
  try {
    return res.json({ success: true, stats: stats() });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/memory/:scope — get all facts for a scope
router.get('/:scope', (req, res) => {
  try {
    const { scope } = req.params;
    const limit       = parseInt(req.query.limit) || 50;
    const minImportance = parseInt(req.query.min) || 1;
    const rows = recallAll(scope, { limit, minImportance });
    return res.json({ success: true, scope, count: rows.length, memories: rows });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/memory/:scope/:key — get a specific fact
router.get('/:scope/:key', (req, res) => {
  try {
    const value = recall(req.params.scope, req.params.key);
    if (value === null) return res.status(404).json({ success: false, error: 'Fact not found.' });
    return res.json({ success: true, scope: req.params.scope, key: req.params.key, value });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/memory/:scope — write a fact
// Body: { key, value, importance?, source? }
router.post('/:scope', async (req, res) => {
  const { key, value, importance, source } = req.body || {};
  if (!key || value === undefined) return res.status(400).json({ success: false, error: 'key and value are required.' });
  try {
    const result = remember(req.params.scope, key, value, { importance, source });
    // Async cloud sync (non-blocking)
    syncMemoryToSupabase([{ scope: req.params.scope, key, value, source, importance }]).catch(() => {});
    return res.json({ success: true, written: result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/memory/search?q=keyword&scope=optional
router.get('/search', (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ success: false, error: 'Provide ?q=keyword' });
  try {
    const results = search(q, { scope: req.query.scope, limit: parseInt(req.query.limit) || 20 });
    return res.json({ success: true, query: q, count: results.length, results });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/memory/events/:scope — get event log
router.get('/events/:scope', (req, res) => {
  try {
    const events = getEvents(req.params.scope, { limit: parseInt(req.query.limit) || 50 });
    return res.json({ success: true, scope: req.params.scope, count: events.length, events });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/memory/sync — pull latest from Supabase into SQLite
router.post('/sync', async (req, res) => {
  try {
    const scope = req.body?.scope;
    const rows  = await loadMemoryFromSupabase(scope);
    // Write cloud rows into local SQLite
    rows.forEach(row => {
      remember(row.scope, row.key, row.value, { importance: row.importance, source: row.source });
    });
    log(`[memory] Synced ${rows.length} rows from Supabase.`);
    return res.json({ success: true, synced: rows.length });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
