/**
 * ACC Watchdog — keeps PM2 alive permanently
 * Runs as a background process via PM2 itself
 * Checks every 30 seconds if acc-server and acc-bot are running
 * If not, restarts them. Self-heals without admin rights.
 */
'use strict';
var cp  = require('child_process');
var fs  = require('fs');
var PM2 = 'C:\\Users\\Shaya\\AppData\\Roaming\\npm\\pm2.cmd';
var DIR = 'C:\\Users\\Shaya\\agent-command-center';
var LOG = DIR + '\\data\\watchdog.log';

function log(msg) {
  var line = '[' + new Date().toISOString() + '] ' + msg + '\n';
  process.stdout.write(line);
  try { fs.appendFileSync(LOG, line); } catch(e) {}
}

function run(cmd, args) {
  return new Promise(function(resolve) {
    var out = '';
    var proc = cp.spawn(cmd, args, { cwd: DIR, shell: true });
    proc.stdout.on('data', function(d){ out += d.toString(); });
    proc.stderr.on('data', function(d){ out += d.toString(); });
    proc.on('close', function(code){ resolve({ code: code, out: out.trim() }); });
    proc.on('error', function(e){ resolve({ code: 1, out: e.message }); });
  });
}

async function checkAndHeal() {
  // Check health endpoint
  try {
    var http = require('http');
    await new Promise(function(resolve, reject) {
      var req = http.get('http://localhost:4000/api/health', { timeout: 5000 }, function(res) {
        if (res.statusCode === 200) resolve(true);
        else reject(new Error('status ' + res.statusCode));
      });
      req.on('error', reject);
      req.on('timeout', function(){ req.destroy(); reject(new Error('timeout')); });
    });
    // Server is healthy — nothing to do
    return;
  } catch(e) {
    log('UNHEALTHY: ' + e.message + ' — attempting heal...');
  }

  // Try resurrect first (fastest)
  var r1 = await run(PM2, ['resurrect']);
  log('Resurrect: ' + r1.out.slice(0, 80));

  // Wait 5s and check again
  await new Promise(function(r){ setTimeout(r, 5000); });
  try {
    var http = require('http');
    await new Promise(function(resolve, reject) {
      http.get('http://localhost:4000/api/health', { timeout: 5000 }, function(res) {
        res.statusCode === 200 ? resolve() : reject(new Error('still down'));
      }).on('error', reject);
    });
    log('HEALED via resurrect');
    return;
  } catch(e) {}

  // Fresh start
  var r2 = await run(PM2, ['start', DIR + '\\pm2.config.js', '--update-env']);
  log('Fresh start: ' + r2.out.slice(0, 80));
  var r3 = await run(PM2, ['save']);
  log('Saved: ' + r3.code);
}

// Run immediately, then every 30 seconds
log('Watchdog started — checking every 30s');
checkAndHeal();
setInterval(checkAndHeal, 30000);

// Keep alive
process.on('SIGINT', function(){ log('Watchdog stopping'); process.exit(0); });
