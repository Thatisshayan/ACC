'use strict';
// cloud/hub/routes.js — Express router for /api/hub
// Mount at: app.use('/api/hub', require('./hub/routes'))

const express  = require('express');
const router   = express.Router();
const registry = require('./registry.js');
const events   = require('./events.js');
const commands = require('./commands.js');
const memory   = require('../memory/store.js');

// ── App registration ──────────────────────────────────────────────────────────
// POST /api/hub/register
// Body: { id, name, type, capabilities[], webhookUrl?, description? }

router.post('/register', function(req, res) {
  try {
    var app = registry.register(req.body);
    return res.json({ success: true, app });
  } catch(e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// ── Heartbeat ─────────────────────────────────────────────────────────────────
// POST /api/hub/heartbeat  Body: { appId }

router.post('/heartbeat', function(req, res) {
  var ok = registry.heartbeat(req.body && req.body.appId);
  return res.json({ success: ok });
});

// ── Inbound events from apps ──────────────────────────────────────────────────
// POST /api/hub/event
// Body: { appId, type, data?, action?, dataType?, question?, priority? }

router.post('/event', async function(req, res) {
  try {
    var result = await events.processEvent(req.body);
    return res.json(result);
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── ACC sends command to an app ───────────────────────────────────────────────
// POST /api/hub/command
// Body: { appId, command, payload? }

router.post('/command', async function(req, res) {
  try {
    var b = req.body || {};
    var result = await commands.sendCommand(b.appId, b.command, b.payload);
    return res.json(result);
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── Broadcast command to apps with a capability ───────────────────────────────
// POST /api/hub/broadcast  Body: { capability, command, payload? }

router.post('/broadcast', async function(req, res) {
  try {
    var b = req.body || {};
    var result = await commands.broadcast(b.capability, b.command, b.payload);
    return res.json(result);
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── List registered apps ──────────────────────────────────────────────────────
// GET /api/hub/apps?type=&status=&capability=

router.get('/apps', function(req, res) {
  var apps = registry.getAllApps({
    type:       req.query.type,
    status:     req.query.status,
    capability: req.query.capability,
  });
  return res.json({ success: true, total: apps.length, apps });
});

// ── Get single app ────────────────────────────────────────────────────────────
// GET /api/hub/apps/:appId

router.get('/apps/:appId', function(req, res) {
  var app = registry.getApp(req.params.appId);
  if (!app) return res.status(404).json({ success: false, error: 'App not found' });
  return res.json({ success: true, app });
});

// ── Memory API ────────────────────────────────────────────────────────────────
// GET  /api/hub/memory?scope=&query=
// POST /api/hub/memory  Body: { scope, key, value, importance? }

router.get('/memory', function(req, res) {
  var scope = req.query.scope || 'global';
  var query = req.query.query;
  var data  = query ? memory.search(query, { scope }) : memory.recallAll(scope, { limit: 50 });
  return res.json({ success: true, scope, total: data.length, memories: data });
});

router.post('/memory', function(req, res) {
  var b = req.body || {};
  if (!b.key || b.value === undefined) return res.status(400).json({ success: false, error: 'key and value required' });
  var result = memory.remember(b.scope || 'global', b.key, b.value, { source: b.source || 'api', importance: b.importance || 5 });
  return res.json({ success: true, memory: result });
});

router.delete('/memory', function(req, res) {
  var b = req.body || {};
  var ok = memory.forget(b.scope || 'global', b.key);
  return res.json({ success: ok });
});

// ── Hub status ────────────────────────────────────────────────────────────────
// GET /api/hub/status

router.get('/status', function(req, res) {
  var apps = registry.getAllApps();
  var online  = apps.filter(function(a) { return a.status === 'online'; }).length;
  var memStats = memory.stats();
  var recentEvents = memory.getEvents('hub:events', { limit: 10 });
  return res.json({
    success: true,
    hub: {
      apps_total:  apps.length,
      apps_online: online,
      memory:      memStats,
      recent_events: recentEvents.length,
    },
    apps,
    recent_events: recentEvents,
  });
});

module.exports = router;
