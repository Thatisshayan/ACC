'use strict';
// cloud/integrations/sentry.js — Sentry error tracking

var DSN = process.env.SENTRY_DSN;

if (!DSN) console.warn('[sentry] SENTRY_DSN not set — integration disabled');

function enabled() {
  return !!DSN;
}

function dsnValid() {
  try {
    var u = new URL(DSN);
    return u.protocol === 'https:' && !!u.hostname;
  } catch (e) {
    return false;
  }
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'SENTRY_DSN missing' };
  if (!dsnValid()) return { status: 'error', error: 'SENTRY_DSN format invalid' };
  return { status: 'configured', note: 'DSN present; event ingest not probed' };
}

module.exports = { checkHealth, enabled };
