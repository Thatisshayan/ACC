'use strict';
// cloud/hub/events.js — Inbound events from apps → ACC task bus
// Any registered app POSTs here; ACC decides what to do with it

const memory   = require('../memory/store.js');
const registry = require('./registry.js');
const { log }  = require('../utils/logger.js');

// Lazy-load store to avoid circular deps at startup
function getStore() { return require('../taskbus/store.js'); }

// ── Event type → ACC action mapping ──────────────────────────────────────────
// Each handler receives (event, app) and returns a task spec or null

const EVENT_HANDLERS = {
  // A user did something in an app
  'user.action': function(event) {
    return {
      title: '[Hub] User action: ' + (event.action || 'unknown') + ' from ' + event.appId,
      instruction: 'A user performed action "' + (event.action || 'unknown') + '" in app ' + event.appId + '.\nPayload: ' + JSON.stringify(event.data || {}),
      assigned_agent: 'claude',
      automation_mode: 'auto',
      approval_required: false,
    };
  },

  // External data arrived (email, form, webhook, payment, etc.)
  'data.received': function(event) {
    return {
      title: '[Hub] Data from ' + event.appId + ': ' + (event.dataType || 'unknown'),
      instruction: 'New data received from app ' + event.appId + ' (type: ' + (event.dataType || 'unknown') + ').\nProcess and take appropriate action.\nData: ' + JSON.stringify(event.data || {}),
      assigned_agent: 'claude',
      automation_mode: 'semi_auto',
      approval_required: false,
    };
  },

  // App is asking ACC for help / a decision
  'request.help': function(event) {
    return {
      title: '[Hub] Help request from ' + event.appId,
      instruction: event.question || ('App ' + event.appId + ' needs assistance: ' + JSON.stringify(event.data || {})),
      assigned_agent: 'claude',
      automation_mode: 'semi_auto',
      approval_required: false,
    };
  },

  // Status / health update (just stored in memory, no task)
  'app.status': function(event) {
    registry.heartbeat(event.appId);
    memory.remember('hub:status:' + event.appId, 'latest', event.data || {}, { source: event.appId, importance: 6 });
    return null; // no task needed
  },

  // Task completed by the app — store result
  'task.completed': function(event) {
    memory.logEvent('hub:results', 'task_completed', event, event.appId);
    return null;
  },

  // App reports an error — ACC logs and optionally alerts
  'app.error': function(event) {
    memory.logEvent('hub:errors', 'app_error', event, event.appId);
    if (event.severity === 'critical') {
      return {
        title: '[Hub] CRITICAL error in ' + event.appId,
        instruction: 'App ' + event.appId + ' reported a critical error: ' + JSON.stringify(event.data || {}),
        assigned_agent: 'claude',
        automation_mode: 'semi_auto',
        approval_required: true,
      };
    }
    return null;
  },
};

// ── Process inbound event ─────────────────────────────────────────────────────

async function processEvent(event) {
  if (!event || !event.appId || !event.type) {
    return { success: false, error: 'appId and type are required' };
  }

  // Update registry heartbeat
  registry.heartbeat(event.appId);

  // Log all events to memory
  memory.logEvent('hub:events', event.type, event, event.appId);

  // Route to handler
  var handler = EVENT_HANDLERS[event.type];
  if (!handler) {
    log('[hub] Unknown event type:', event.type, 'from', event.appId);
    return { success: true, action: 'logged', note: 'No handler for type: ' + event.type };
  }

  var taskSpec = handler(event);
  if (!taskSpec) {
    return { success: true, action: 'stored' };
  }

  // Create task in ACC task bus
  var store = getStore();
  var task = store.createTask(Object.assign({
    created_by: 'hub:' + event.appId,
    priority: event.priority || 'normal',
    meta: { hubEvent: event.type, appId: event.appId },
  }, taskSpec));

  log('[hub] Event', event.type, 'from', event.appId, '→ task', task.id.slice(0, 8));
  return { success: true, action: 'task_created', taskId: task.id };
}

module.exports = { processEvent, EVENT_HANDLERS };
