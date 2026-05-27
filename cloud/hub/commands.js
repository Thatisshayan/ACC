'use strict';
// cloud/hub/commands.js — ACC sends commands to registered apps
// ACC is the brain; apps are workers that receive and execute commands

const axios    = require('axios');
const registry = require('./registry.js');
const memory   = require('../memory/store.js');
const { log }  = require('../utils/logger.js');

// ── Send command to a specific app ────────────────────────────────────────────

async function sendCommand(appId, command, payload, opts) {
  var o = opts || {};
  var app = registry.getApp(appId);
  if (!app) return { success: false, error: 'App not registered: ' + appId };
  if (app.status !== 'online') return { success: false, error: 'App is offline: ' + appId };
  if (!app.webhookUrl) return { success: false, error: 'App has no webhookUrl: ' + appId };

  var body = {
    from:      'acc',
    command:   command,
    payload:   payload || {},
    timestamp: new Date().toISOString(),
    requestId: require('uuid').v4(),
  };

  memory.logEvent('hub:commands', 'command_sent', { appId, command, requestId: body.requestId }, 'acc');

  try {
    var r = await axios.post(app.webhookUrl, body, {
      timeout: o.timeout || 10000,
      headers: { 'Content-Type': 'application/json', 'X-ACC-Source': 'acc-hub' },
    });
    log('[hub] Command', command, '→', appId, '| status:', r.status);
    memory.logEvent('hub:commands', 'command_ack', { appId, command, status: r.status }, appId);
    return { success: true, status: r.status, data: r.data };
  } catch (e) {
    var errMsg = e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data)) : e.message;
    log('[hub] Command', command, '→', appId, 'FAILED:', errMsg);
    memory.logEvent('hub:commands', 'command_failed', { appId, command, error: errMsg }, 'acc');
    if (e.response && e.response.status >= 400 && e.response.status < 500) {
      registry.markOffline(appId);
    }
    return { success: false, error: errMsg };
  }
}

// ── Broadcast to all apps with a capability ───────────────────────────────────

async function broadcast(capability, command, payload) {
  var apps = registry.findByCapability(capability);
  if (!apps.length) return { success: true, sent: 0, note: 'No online apps with capability: ' + capability };
  var results = await Promise.allSettled(apps.map(function(app) {
    return sendCommand(app.id, command, payload);
  }));
  var sent = results.filter(function(r) { return r.status === 'fulfilled' && r.value.success; }).length;
  log('[hub] Broadcast', command, '→', apps.length, 'apps,', sent, 'delivered');
  return { success: true, sent, total: apps.length, results: results.map(function(r) { return r.value || r.reason; }) };
}

// ── Notify all apps of an ACC event (e.g. task completed, system alert) ───────

async function notifyAll(eventType, payload) {
  return broadcast('notifications', eventType, payload);
}

module.exports = { sendCommand, broadcast, notifyAll };
