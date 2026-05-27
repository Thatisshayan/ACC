'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const logDir = path.join(repoRoot, 'data', 'logs');
const runDir = path.join(repoRoot, 'data', 'run');
const pidDir = path.join(runDir, 'pids');

const supervisorPidPath = path.join(pidDir, 'acc-supervisor.pid');
const backendPidPath = path.join(pidDir, 'acc-backend.pid');
const botPidPath = path.join(pidDir, 'acc-bot.pid');

const backendOut = path.join(logDir, 'acc-backend.out.log');
const backendErr = path.join(logDir, 'acc-backend.err.log');
const botOut = path.join(logDir, 'acc-bot.out.log');
const botErr = path.join(logDir, 'acc-bot.err.log');
const supervisorLog = path.join(logDir, 'acc-supervisor.log');

const backendEntry = path.join(repoRoot, 'scripts', 'start.js');
const botEntry = path.join(repoRoot, 'cloud', 'telegram', 'bot.js');
const botLock = require(path.join(repoRoot, 'cloud', 'telegram', 'botLock.js'));

let backendChild = null;
let botChild = null;
let stopping = false;

function ensureDirs() {
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(pidDir, { recursive: true });
}

function log(line) {
  try {
    fs.appendFileSync(supervisorLog, '[' + new Date().toISOString() + '] ' + line + '\n');
  } catch (err) {
    // best effort only
  }
}

function writePid(filePath, pid) {
  fs.writeFileSync(filePath, String(pid), 'utf8');
}

function clearPid(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    // best effort only
  }
}

function readPid(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const value = Number(fs.readFileSync(filePath, 'utf8').trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch (err) {
    return null;
  }
}

function isPidAlive(pid) {
  const value = Number(pid);
  if (!Number.isFinite(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (err) {
    return false;
  }
}

function healthCheck(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy(new Error('timeout'));
      resolve(false);
    });
  });
}

function spawnManaged(name, entry, args, outPath, errPath, pidPath, onExit, extraEnv) {
  const outFd = fs.openSync(outPath, 'a');
  const errFd = fs.openSync(errPath, 'a');
  const child = spawn(process.execPath, [entry].concat(args || []), {
    cwd: repoRoot,
    windowsHide: true,
    stdio: ['ignore', outFd, errFd],
    env: Object.assign({}, process.env, extraEnv || {}),
  });

  writePid(pidPath, child.pid);
  log(name + ' started pid=' + child.pid);

  child.on('exit', (code, signal) => {
    clearPid(pidPath);
    log(name + ' exited code=' + code + ' signal=' + signal);
    if (!stopping && typeof onExit === 'function') {
      onExit(code, signal);
    }
  });

  child.on('error', (err) => {
    log(name + ' error: ' + (err && err.stack ? err.stack : String(err)));
  });

  return child;
}

function scheduleRetry(fn, delayMs) {
  setTimeout(() => {
    if (!stopping) fn();
  }, delayMs);
}

function ensureBackend() {
  if (stopping) return;
  if (backendChild && isPidAlive(backendChild.pid)) return;

  healthCheck('http://localhost:4000/api/health').then((healthy) => {
    if (stopping) return;
    if (healthy) {
      log('backend already healthy; not starting duplicate');
      return;
    }

    const existingPid = readPid(backendPidPath);
    if (existingPid && isPidAlive(existingPid)) {
      log('backend pid file already points to live pid=' + existingPid);
      return;
    }

    backendChild = spawnManaged('backend', backendEntry, [], backendOut, backendErr, backendPidPath, () => {
      scheduleRetry(ensureBackend, 5000);
    }, {
      ACC_SUPERVISED: '1',
      ACC_SKIP_TELEGRAM_BOT: '1',
    });
  });
}

function ensureBot() {
  const botMode = String(process.env.TELEGRAM_BOT_MODE || '').toLowerCase();
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_PUBLIC_DOMAIN);
  if (isRailway || botMode === 'webhook') {
    log('bot skipped — running on Railway webhook mode');
    return;
  }
  if (botMode === 'disabled') {
    log('bot skipped — TELEGRAM_BOT_MODE=disabled');
    return;
  }
  if (stopping) return;
  const activeBot = botLock.getActiveBot ? botLock.getActiveBot() : null;
  const lockInfo = botLock.getLockInfo ? botLock.getLockInfo() : { pid: null };
  if (activeBot === 'cloud' && lockInfo.pid && isPidAlive(lockInfo.pid)) {
    log('bot already active pid=' + lockInfo.pid + '; not starting duplicate');
    return;
  }
  if (botChild && isPidAlive(botChild.pid)) return;

  const existingPid = readPid(botPidPath);
  if (existingPid && isPidAlive(existingPid)) {
    log('bot pid file already points to live pid=' + existingPid);
    return;
  }

  botChild = spawnManaged('bot', botEntry, [], botOut, botErr, botPidPath, (code) => {
    if (code === 0) {
      const active = botLock.getActiveBot ? botLock.getActiveBot() : null;
      if (active === 'cloud') {
        log('bot exited cleanly while lock still active; leaving it alone');
        return;
      }
    }
    scheduleRetry(ensureBot, 5000);
  });
}

function shutdown(code) {
  stopping = true;
  log('shutdown requested code=' + String(code));
  try { if (backendChild && isPidAlive(backendChild.pid)) backendChild.kill(); } catch (err) {}
  try { if (botChild && isPidAlive(botChild.pid)) botChild.kill(); } catch (err) {}
  clearPid(backendPidPath);
  clearPid(botPidPath);
  clearPid(supervisorPidPath);
  process.exit(typeof code === 'number' ? code : 0);
}

ensureDirs();
writePid(supervisorPidPath, process.pid);
log('supervisor started pid=' + process.pid);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => {
  try { clearPid(supervisorPidPath); } catch (err) {}
});

ensureBackend();
ensureBot();

setInterval(() => {
  if (stopping) return;
  healthCheck('http://localhost:4000/api/health').then((healthy) => {
    if (!healthy) {
      log('backend health failed; ensuring backend');
      ensureBackend();
    }
  });

  if (!isRailway && botMode !== 'webhook' && botMode !== 'disabled') {
    const activeBot = botLock.getActiveBot ? botLock.getActiveBot() : null;
    const lockInfo = botLock.getLockInfo ? botLock.getLockInfo() : { pid: null };
    if (!(activeBot === 'cloud' && lockInfo.pid && isPidAlive(lockInfo.pid))) {
      log('bot lock inactive; ensuring bot');
      ensureBot();
    }
  }
}, 15000);
