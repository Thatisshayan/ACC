'use strict';
// cloud/utils/sentry.js
//
// Centralized Sentry wiring for the ACC process. All first-party Sentry
// capture calls route through this module so that:
//   1. Sentry.init() happens exactly once (in scripts/start.js via
//      initIfConfigured()), after dotenv has loaded SENTRY_DSN.
//   2. Everything no-ops safely when @sentry/node is absent or SENTRY_DSN is
//      unset (dev / CI / tests) — no require, no network, no crash.
//   3. Tests can inject a fake Sentry client via setSentryInstance() without
//      ever touching a real Sentry endpoint.

let Sentry = null;
let initialized = false;

function initIfConfigured() {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || (!dsn.startsWith('http://') && !dsn.startsWith('https://'))) {
    return false;
  }
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
    });
    initialized = true;
    return true;
  } catch (e) {
    console.warn('[sentry] init failed (install @sentry/node to enable):', e.message);
    return false;
  }
}

function isInitialized() {
  return initialized && !!Sentry;
}

function withScopeIfNeeded(contexts, fn) {
  if (Sentry.withScope && contexts && (contexts.tags || contexts.extra || contexts.fingerprint)) {
    Sentry.withScope((scope) => {
      if (contexts.tags) scope.setTags(contexts.tags);
      if (contexts.extra) scope.setExtras(contexts.extra);
      if (contexts.fingerprint) scope.setFingerprint(contexts.fingerprint);
      fn(scope);
    });
    return;
  }
  fn(null);
}

function captureException(error, contexts) {
  if (!isInitialized()) return false;
  withScopeIfNeeded(contexts, () => {
    Sentry.captureException(error);
  });
  return true;
}

function captureMessage(message, contexts) {
  if (!isInitialized()) return false;
  withScopeIfNeeded(contexts, () => {
    Sentry.captureMessage(message);
  });
  return true;
}

// Flush queued events to Sentry. Used by crash handlers before process.exit
// so the final uncaughtException / unhandledRejection event is actually
// delivered instead of being dropped when the process terminates.
function flush(timeoutMs) {
  if (!isInitialized() || typeof Sentry.flush !== 'function') return Promise.resolve(true);
  return Promise.resolve(Sentry.flush(timeoutMs));
}

// Test hook: inject a fake Sentry client (dependency injection). Replaces the
// real @sentry/node module so unit tests never touch a Sentry endpoint.
function setSentryInstance(fake) {
  Sentry = fake || null;
  initialized = !!fake;
}

module.exports = {
  initIfConfigured,
  isInitialized,
  captureException,
  captureMessage,
  flush,
  setSentryInstance,
};
