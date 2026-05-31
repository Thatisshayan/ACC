'use strict';
// cloud/config/validateEnv.js
// Called once at server startup — before any route or module that uses env vars.
// In production: missing CRITICAL vars → print names (never values) → exit 1.
// In development: print a WARNING and continue.

const CRITICAL = [
  'ACC_OPERATOR_API_KEY',
  'ACC_VAULT_MASTER_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET',
];

// Not fatal but should exist before going live
const WARN_ONLY = [
  'TELEGRAM_BOT_TOKEN',
  'STRIPE_API_KEY',
  'DEEPSEEK_API_KEY',
  'RESEND_API_KEY',
];

function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const missing = CRITICAL.filter(function(k) { return !process.env[k]; });

  if (missing.length > 0) {
    console.error(
      '[validateEnv] ' + (isProd ? 'FATAL' : 'WARNING') +
      ': the following required env vars are not set: ' + missing.join(', ')
    );
    if (isProd) {
      console.error('[validateEnv] Refusing to start in production with missing secrets. Exiting.');
      process.exit(1);
    }
  }

  if (!isProd) {
    const warnMissing = WARN_ONLY.filter(function(k) { return !process.env[k]; });
    if (warnMissing.length > 0) {
      console.warn('[validateEnv] Advisory: optional env vars not set: ' + warnMissing.join(', '));
    }
  }

  if (missing.length === 0) {
    const level = isProd ? 'info' : 'debug';
    if (isProd) console.log('[validateEnv] All critical env vars present.');
  }
}

validateEnv();

module.exports = { validateEnv };
