'use strict';
// cloud/hub/registry.js — ACC App Hub registry
// Apps register here so ACC knows what's online and what it can do

const memory = require('../memory/store.js');
const { log } = require('../utils/logger.js');

const SCOPE = 'hub:registry';

// ── Register ──────────────────────────────────────────────────────────────────
// app: { id, name, type, capabilities[], webhookUrl?, description? }

function register(app) {
  if (!app || !app.id || !app.name) throw new Error('app.id and app.name are required');
  var record = {
    id:           app.id,
    name:         app.name,
    type:         app.type || 'custom',       // custom | saas | ai_agent | mobile | desktop
    capabilities: Array.isArray(app.capabilities) ? app.capabilities : [],
    webhookUrl:   app.webhookUrl || null,      // ACC pushes commands here
    description:  app.description || '',
    status:       'online',
    registered_at: new Date().toISOString(),
    last_seen:    new Date().toISOString(),
  };
  memory.remember(SCOPE, app.id, record, { source: 'hub', importance: 8 });
  memory.logEvent(SCOPE, 'app_registered', { appId: app.id, name: app.name, type: app.type }, 'hub');
  log('[hub] App registered:', app.name, '(' + app.type + ')');
  return record;
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

function heartbeat(appId) {
  var app = getApp(appId);
  if (!app) return false;
  app.last_seen = new Date().toISOString();
  app.status = 'online';
  memory.remember(SCOPE, appId, app, { source: 'hub', importance: 8 });
  return true;
}

// ── Offline ───────────────────────────────────────────────────────────────────

function markOffline(appId) {
  var app = getApp(appId);
  if (!app) return false;
  app.status = 'offline';
  memory.remember(SCOPE, appId, app, { source: 'hub', importance: 8 });
  memory.logEvent(SCOPE, 'app_offline', { appId }, 'hub');
  log('[hub] App offline:', appId);
  return true;
}

// ── Query ─────────────────────────────────────────────────────────────────────

function getApp(appId) {
  return memory.recall(SCOPE, appId);
}

function getAllApps(opts) {
  var all = memory.recallAll(SCOPE, { limit: 100 });
  var apps = all.map(function(r) { return r.value; }).filter(Boolean);
  if (opts && opts.type) apps = apps.filter(function(a) { return a.type === opts.type; });
  if (opts && opts.status) apps = apps.filter(function(a) { return a.status === opts.status; });
  if (opts && opts.capability) apps = apps.filter(function(a) { return a.capabilities && a.capabilities.includes(opts.capability); });
  return apps;
}

function findByCapability(capability) {
  return getAllApps({ capability, status: 'online' });
}

module.exports = { register, heartbeat, markOffline, getApp, getAllApps, findByCapability };
