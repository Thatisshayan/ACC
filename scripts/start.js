// scripts/start.js
// Unified startup — loads .env, launches cloud API + worker.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { startWorker } = require("../cloud/worker.js");

// Start the cloud API server (which also starts the WebSocket server)
require("../cloud/server.js");

// Start the priority worker loop
startWorker({ intervalMs: 500 });

console.log("[start] ACC v2 started. API on :4000, WS on :4000/ws, Worker running.");
console.log("[start] Run 'npm run cloud:telegram' in a separate terminal to start the Telegram bot.");
