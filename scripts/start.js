require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

const port = process.env.PORT || 4000;
const { startWorker } = require("../cloud/worker.js");
require("../cloud/server.js");
startWorker({ intervalMs: 500 });
console.log("[start] ACC v2 started. API on :" + port + ", WS on :" + port + "/ws, Worker running.");
console.log("[start] Run 'npm run cloud:telegram' in a separate terminal to start the Telegram bot.");
