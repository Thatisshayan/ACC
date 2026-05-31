process.on('uncaughtException', (e) => console.error('[start] UNCAUGHT:', e.message, e.stack));
process.on('unhandledRejection', (e) => console.error('[start] UNHANDLED:', e));

console.log('[start] process starting, NODE_ENV=' + process.env.NODE_ENV + ' PORT=' + process.env.PORT);
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
    });
    console.log('[start] Sentry initialized');
  } catch(e) {
    console.warn('[start] Sentry not available (install @sentry/node to enable):', e.message);
  }
}

const port = process.env.PORT || 4000;
console.log('[start] loading worker...');
const { startWorker } = require("../cloud/worker.js");
console.log('[start] loading lead poller...');
const { startLeadCollectorPoller } = require("../cloud/workflows/leadCollectorPoller.js");

// Start API server + worker
console.log('[start] loading server...');
require("../cloud/server.js");
console.log('[start] starting worker...');
startWorker({ intervalMs: 500 });
console.log('[start] starting lead poller...');
startLeadCollectorPoller();
console.log("[start] ACC v2 server started on :" + port);

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveWebhookBaseUrl() {
  var explicit = process.env.TELEGRAM_WEBHOOK_URL || process.env.ACC_WEBHOOK_BASE_URL || process.env.ACC_PUBLIC_URL || process.env.ACC_WEBAPP_URL || process.env.ACC_API_BASE_URL || process.env.PUBLIC_URL;
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch (_) {
      return trimUrl(explicit).replace(/\/mini$/, '');
    }
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL) {
    return 'https://' + (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL);
  }
  return '';
}

function resolveWebhookUrl() {
  if (process.env.TELEGRAM_WEBHOOK_URL) return process.env.TELEGRAM_WEBHOOK_URL;
  var base = resolveWebhookBaseUrl();
  return base ? base.replace(/\/+$/, '') + '/api/webhook/telegram' : '';
}

var isHostedWebhook = Boolean(
  process.env.TELEGRAM_BOT_MODE === 'webhook'
  || process.env.ACC_PUBLIC_URL
  || process.env.ACC_WEBAPP_URL
  || process.env.ACC_API_BASE_URL
  || process.env.PUBLIC_URL
  || process.env.RAILWAY_ENVIRONMENT
  || process.env.RAILWAY_SERVICE_NAME
  || process.env.RAILWAY_PUBLIC_DOMAIN
);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn("[start] TELEGRAM_BOT_TOKEN not set â€” bot not started.");
} else if (process.env.ACC_SKIP_TELEGRAM_BOT === '1' || process.env.ACC_SUPERVISED === '1') {
  console.log("[start] Telegram bot startup skipped by supervisor.");
} else if (isHostedWebhook) {
  console.log("[start] Hosted deployment detected â€” using webhook mode for Telegram bot.");
  var webhookUrl = resolveWebhookUrl();

  var https = require('https');
  var token = process.env.TELEGRAM_BOT_TOKEN;

  if (!webhookUrl) {
    console.warn('[start] Hosted deployment requested, but no webhook URL is configured. Falling back to polling.');
    try {
      require("../cloud/telegram/bot.js");
      console.log("[start] Telegram bot started (polling fallback).");
    } catch(e) {
      console.error("[start] Telegram bot failed:", e.message);
    }
  } else {
    // WEBHOOK MODE â€” register webhook with Telegram then serve updates
    var regUrl = 'https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(webhookUrl) + '&drop_pending_updates=true';
    if (process.env.TELEGRAM_WEBHOOK_SECRET) {
      regUrl += '&secret_token=' + encodeURIComponent(process.env.TELEGRAM_WEBHOOK_SECRET);
    }
    https.get(regUrl, function(res) {
      var d = '';
      res.on('data', function(c){ d += c; });
      res.on('end', function() {
        try {
          var result = JSON.parse(d);
          if (result.ok) {
            console.log("[start] Telegram webhook registered:", webhookUrl);
          } else {
            console.error("[start] Webhook registration failed:", d);
          }
        } catch(e) { console.error("[start] Webhook reg parse error:", e.message); }
      });
    }).on('error', function(e) {
      console.error("[start] Webhook registration error:", e.message);
    });

    // Wire webhook updates into the real bot handler
    setTimeout(function() {
      try {
        var bot = require("../cloud/telegram/bot.js");
        if (typeof bot.handleMessage === 'function') {
          global.__accBotHandleMessage  = bot.handleMessage;
          global.__accBotHandleCallback = bot.handleCallback;
          console.log("[start] Bot handlers wired to webhook.");
        } else {
          console.log("[start] Bot loaded in webhook mode.");
        }
      } catch(e) {
        console.error("[start] Bot load error:", e.message);
      }
    }, 2000);
  }
} else {
  // POLLING MODE â€” local development
  console.log("[start] Local mode â€” starting Telegram bot with long-polling.");
  try {
    require("../cloud/telegram/bot.js");
    console.log("[start] Telegram bot started (polling).");
  } catch(e) {
    console.error("[start] Telegram bot failed:", e.message);
  }
}

console.log("[start] ACC v2 fully online | API :" + port);
