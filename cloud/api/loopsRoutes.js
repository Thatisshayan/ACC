'use strict';
// cloud/api/loopsRoutes.js — Autonomy loops CRUD + run history
// Mount at: app.use('/api/loops', require('./api/loopsRoutes'))

const express = require('express');
const router  = express.Router();
const { v4: uuid } = require('uuid');
const { log } = require('../utils/logger.js');

let _db = null;
function db() {
  if (_db) return _db;
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    _db = createClient(url, key);
    return _db;
  } catch { return null; }
}

// GET /api/loops
router.get('/', async (req, res) => {
  const client = db();
  if (!client) return res.json({ success: true, loops: [], note: 'Supabase not configured' });
  try {
    const { data, error } = await client
      .from('acc_autonomy_loops')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, loops: data || [] });
  } catch (e) {
    log('[loops] list error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/loops
router.post('/', async (req, res) => {
  const client = db();
  if (!client) return res.status(503).json({ success: false, error: 'Supabase not configured' });
  const { name, goal, agent = 'alphonso', interval_ms = 3600000 } = req.body || {};
  if (!name || !goal) return res.status(400).json({ success: false, error: 'name and goal are required' });

  const now = new Date().toISOString();
  const loop = {
    id: uuid(),
    name,
    goal,
    agent,
    interval_ms: Number(interval_ms),
    enabled: true,
    run_count: 0,
    fail_count: 0,
    created_at: now,
    updated_at: now,
    next_run: new Date(Date.now() + Number(interval_ms)).toISOString(),
  };

  try {
    const { error } = await client.from('acc_autonomy_loops').insert(loop);
    if (error) throw error;
    return res.json({ success: true, loop });
  } catch (e) {
    log('[loops] create error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /api/loops/:id
router.patch('/:id', async (req, res) => {
  const client = db();
  if (!client) return res.status(503).json({ success: false, error: 'Supabase not configured' });
  const allowed = ['name', 'goal', 'agent', 'interval_ms', 'enabled'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  updates.updated_at = new Date().toISOString();

  try {
    const { error } = await client.from('acc_autonomy_loops').update(updates).eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e) {
    log('[loops] update error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/loops/:id
router.delete('/:id', async (req, res) => {
  const client = db();
  if (!client) return res.status(503).json({ success: false, error: 'Supabase not configured' });
  try {
    const { error } = await client.from('acc_autonomy_loops').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e) {
    log('[loops] delete error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/loops/:id/runs
router.get('/:id/runs', async (req, res) => {
  const client = db();
  if (!client) return res.json({ success: true, runs: [] });
  try {
    const { data, error } = await client
      .from('acc_loop_runs')
      .select('*')
      .eq('loop_id', req.params.id)
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return res.json({ success: true, runs: data || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
