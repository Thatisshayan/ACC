require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

const fs = require('fs');
const path = require('path');

function writeStartupLog(line) {
  try {
    const logPath = path.join(__dirname, '../data/logs/startup-debug.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, '[' + new Date().toISOString() + '] ' + line + '\n');
  } catch (e) {
    // best effort only
  }
}

process.on('uncaughtException', (err) => {
  writeStartupLog('uncaughtException: ' + (err && err.stack ? err.stack : String(err)));
});

process.on('unhandledRejection', (reason) => {
  writeStartupLog('unhandledRejection: ' + (reason && reason.stack ? reason.stack : String(reason)));
});

const port = process.env.PORT || 4000;
const { startWorker } = require("../cloud/worker.js");
const { startLeadCollectorPoller } = require("../cloud/workflows/leadCollectorPoller.js");
require("../cloud/server.js");
startWorker({ intervalMs: 500 });
startLeadCollectorPoller();
writeStartupLog('startup sequence invoked for port ' + port);
console.log("[start] ACC v2 started. API on :" + port + ", WS on :" + port + "/ws, Worker running.");
console.log("[start] Run 'npm run cloud:telegram' in a separate terminal to start the Telegram bot.");
