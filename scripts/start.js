require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

const port = process.env.PORT || 4000;
const { startWorker } = require("../cloud/worker.js");
const { startLeadCollectorPoller } = require("../cloud/workflows/leadCollectorPoller.js");

// Start API server + worker
require("../cloud/server.js");
startWorker({ intervalMs: 500 });
startLeadCollectorPoller();
console.log("[start] ACC v2 server started on :" + port);

// ── Telegram Bot — smart mode selection ──────────────────────────────────────
// On Railway (RAILWAY_ENVIRONMENT or PORT=8080): use webhook
// Locally (no RAILWAY_ENVIRONMENT): use polling
// ─────────────────────────────────────────────────────────────────────────────
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn("[start] TELEGRAM_BOT_TOKEN not set — bot not started.");
} else {
  var isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_PUBLIC_DOMAIN;
  
  if (isRailway) {
    // WEBHOOK MODE — register webhook with Telegram then serve updates
    console.log("[start] Railway detected — using webhook mode for Telegram bot.");
    var railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || 'acc-production-a26c.up.railway.app';
    var webhookUrl = 'https://' + railwayDomain + '/api/webhook/telegram';
    
    var https = require('https');
    var token = process.env.TELEGRAM_BOT_TOKEN;
    
    // Register webhook with Telegram
    var regUrl = 'https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(webhookUrl) + '&drop_pending_updates=true';
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
    // The bot.js exports handleMessage and handleCallback for this
    setTimeout(function() {
      try {
        var bot = require("../cloud/telegram/bot.js");
        // Expose handlers on global so webhookHandler can call them
        if (typeof bot.handleMessage === 'function') {
          global.__accBotHandleMessage  = bot.handleMessage;
          global.__accBotHandleCallback = bot.handleCallback;
          console.log("[start] Bot handlers wired to webhook.");
        } else {
          // bot.js auto-starts polling — in webhook mode we just need the webhook route
          // to receive updates and the bot.js logic won't conflict since it detected webhook
          console.log("[start] Bot loaded in webhook mode.");
        }
      } catch(e) {
        console.error("[start] Bot load error:", e.message);
      }
    }, 2000);

  } else {
    // POLLING MODE — local development
    console.log("[start] Local mode — starting Telegram bot with long-polling.");
    try {
      require("../cloud/telegram/bot.js");
      console.log("[start] Telegram bot started (polling).");
    } catch(e) {
      console.error("[start] Telegram bot failed:", e.message);
    }
  }
}

console.log("[start] ACC v2 fully online | API :" + port);
