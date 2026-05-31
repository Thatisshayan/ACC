// cloud/security/webhookHmac.js
// Reusable inbound webhook validation middleware.
//
// Two modes:
//   requireTelegramSecret()  — validates X-Telegram-Bot-Api-Secret-Token header
//   requireHmacSignature()   — validates X-Hub-Signature-256 (GitHub/Stripe style)
//                              Must mount BEFORE express.json() on the target route
//                              so the raw body is still available.
'use strict';

const crypto = require('crypto');

// ── Telegram secret token validation ─────────────────────────────────────────
// Set TELEGRAM_WEBHOOK_SECRET in .env, then configure the same value when
// registering your bot webhook:
//   POST https://api.telegram.org/bot<token>/setWebhook
//     { url: "...", secret_token: "<TELEGRAM_WEBHOOK_SECRET>" }
// Telegram sends it back as: X-Telegram-Bot-Api-Secret-Token: <secret>
function requireTelegramSecret() {
  var secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!secret) {
    console.warn('[webhookHmac] TELEGRAM_WEBHOOK_SECRET not set — Telegram webhook is OPEN to anyone');
  }

  return function telegramSecretMiddleware(req, res, next) {
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ success: false, error: 'Telegram webhook secret not configured.' });
      }
      return next(); // non-production passthrough
    }

    var header = req.headers['x-telegram-bot-api-secret-token'] || '';
    // Timing-safe comparison: prevents timing attacks even for short secrets.
    var secretBuf = Buffer.from(secret);
    var headerBuf = Buffer.from(header);
    var lenOk     = secretBuf.length === headerBuf.length;
    // Always run timingSafeEqual with equal-length buffers to avoid leaking length.
    var padded = lenOk ? headerBuf : Buffer.alloc(secretBuf.length, 0);
    var valid  = lenOk && crypto.timingSafeEqual(secretBuf, padded);

    if (!valid) {
      console.warn('[webhookHmac] Telegram webhook rejected — bad secret token from', req.ip);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };
}

// ── Generic HMAC-SHA256 webhook validation (GitHub / generic style) ───────────
// Usage:
//   router.post('/webhook', express.raw({ type: '*/*' }), requireHmacSignature({
//     secretEnvVar: 'MY_WEBHOOK_SECRET',
//     header:       'x-hub-signature-256',   // default
//     prefix:       'sha256=',               // default
//   }), express.json(), handler);
//
// The raw body is attached to req.rawBody for downstream use if needed.
function requireHmacSignature(opts) {
  var options    = opts || {};
  var envVar     = options.secretEnvVar || 'WEBHOOK_HMAC_SECRET';
  var headerName = (options.header || 'x-hub-signature-256').toLowerCase();
  var prefix     = options.prefix !== undefined ? options.prefix : 'sha256=';

  return function hmacMiddleware(req, res, next) {
    var secret = process.env[envVar] || '';
    if (!secret) {
      console.warn('[webhookHmac] ' + envVar + ' not set — HMAC validation disabled for this route');
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ success: false, error: 'Webhook HMAC secret not configured.' });
      }
      return next(); // non-production passthrough
    }

    // express.raw() puts the body in req.body as a Buffer.
    var raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      return res.status(400).json({ success: false, error: 'Raw body required for HMAC validation — mount express.raw() before this middleware' });
    }

    var sigHeader = req.headers[headerName] || '';
    var sigHex    = sigHeader.startsWith(prefix) ? sigHeader.slice(prefix.length) : sigHeader;

    var expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    var expectedBuf = Buffer.from(expected,  'hex');
    var receivedBuf = Buffer.from(sigHex || '', 'hex');

    var lenOk = expectedBuf.length === receivedBuf.length && expectedBuf.length > 0;
    var padded = lenOk ? receivedBuf : Buffer.alloc(expectedBuf.length, 0);
    var valid  = lenOk && crypto.timingSafeEqual(expectedBuf, padded);

    if (!valid) {
      console.warn('[webhookHmac] HMAC mismatch on', req.path, 'from', req.ip);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Expose raw body for downstream handlers that need to re-parse (e.g. Stripe SDK).
    req.rawBody = raw;
    next();
  };
}

module.exports = { requireTelegramSecret, requireHmacSignature };
