require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

const port = process.env.PORT || 4000;
const { startWorker } = require("../cloud/worker.js");
const { startLeadCollectorPoller } = require("../cloud/workflows/leadCollectorPoller.js");
const { spawn } = require('child_process');
const path = require('path');

// Start API server + worker
require("../cloud/server.js");
startWorker({ intervalMs: 500 });
startLeadCollectorPoller();
console.log("[start] ACC v2 server started on :" + port);

// Start Telegram bot in same process via require (not spawn) so Railway keeps one dyno
// Only start if TELEGRAM_BOT_TOKEN is set
if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    console.log("[start] Starting Telegram bot (@OurAccbot)...");
    require("../cloud/telegram/bot.js");
    console.log("[start] Telegram bot started.");
  } catch(e) {
    console.error("[start] Telegram bot failed to start:", e.message);
  }
} else {
  console.warn("[start] TELEGRAM_BOT_TOKEN not set — bot not started.");
}

console.log("[start] ACC v2 fully online. API :" + port + " | Bot: " + (process.env.TELEGRAM_BOT_TOKEN ? "@OurAccbot" : "not configured"));
