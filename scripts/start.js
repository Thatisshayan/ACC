// scripts/start.js
// Load .env only in local dev — Railway injects vars directly
if (process.env.NODE_ENV !== 'REDACTED') {
  try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch(e) {}
}

const { startWorker } = require("../cloud/worker.js");

// Start the cloud API server (which also starts the WebSocket server)
require("../cloud/server.js");

// Start the priority worker loop
startWorker({ intervalMs: 500 });

console.log("[start] ACC v2 started. API on :4000, WS on :4000/ws, Worker running.");
console.log("[start] Run 'npm run cloud:telegram' in a separate terminal to start the Telegram bot.");
