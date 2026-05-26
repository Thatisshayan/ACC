'use strict';

const fs = require('fs');
const path = require('path');

const RUN_DIR = path.join(__dirname, '../../data/run');
const LOCK_FILE = path.join(RUN_DIR, 'telegram-bot.lock.json');
const LOCK_TTL_MS = parseInt(process.env.TELEGRAM_BOT_LOCK_TTL_MS || String(90 * 1000), 10);

function ensureRunDir() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
}

function safeReadLock() {
  ensureRunDir();
  if (!fs.existsSync(LOCK_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
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

function normalizeLock(lock) {
  if (!lock || typeof lock !== 'object') {
    return {
      activeBot: null,
      pid: null,
      lastHeartbeat: null,
      startedAt: null,
      source: 'missing',
      stale: true,
      healthy: false,
    };
  }

  const now = Date.now();
  const lastHeartbeat = Number(lock.lastHeartbeat || lock.updatedAt || lock.startedAt || 0);
  const pid = Number(lock.pid || 0);
  const alive = isPidAlive(pid);
  const fresh = lastHeartbeat > 0 ? (now - lastHeartbeat) <= LOCK_TTL_MS : false;
  const healthy = Boolean(lock.activeBot && pid && alive && fresh);

  return Object.assign({}, lock, {
    pid: Number.isFinite(pid) && pid > 0 ? pid : null,
    lastHeartbeat: Number.isFinite(lastHeartbeat) && lastHeartbeat > 0 ? lastHeartbeat : null,
    stale: !healthy,
    healthy,
    source: lock.source || 'file',
  });
}

function writeLock(lock) {
  ensureRunDir();
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2), 'utf8');
  return normalizeLock(lock);
}

function readLockInfo() {
  return normalizeLock(safeReadLock());
}

function claimBot(botName) {
  const current = readLockInfo();
  const now = Date.now();

  if (current.healthy && current.activeBot && current.activeBot !== botName) {
    return false;
  }

  const next = {
    activeBot: botName,
    pid: process.pid,
    startedAt: current.activeBot === botName && current.pid === process.pid && current.startedAt ? current.startedAt : now,
    lastHeartbeat: now,
    source: 'file',
  };

  writeLock(next);
  return true;
}

function releaseBot(botName) {
  const current = readLockInfo();
  if (current.activeBot !== botName) return;
  if (current.pid && current.pid !== process.pid && current.healthy) return;

  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch (err) {
    // best effort
  }
}

function heartbeat(botName) {
  const current = readLockInfo();
  if (current.activeBot !== botName) return false;
  if (current.pid && current.pid !== process.pid && current.healthy) return false;

  const next = Object.assign({}, current, {
    activeBot: botName,
    pid: process.pid,
    startedAt: current.startedAt || Date.now(),
    lastHeartbeat: Date.now(),
    source: 'file',
  });
  writeLock(next);
  return true;
}

function isBotActive(botName) {
  const lock = readLockInfo();
  return Boolean(lock.healthy && lock.activeBot === botName);
}

function getActiveBot() {
  const lock = readLockInfo();
  return lock.healthy ? lock.activeBot : null;
}

function getLockInfo() {
  return readLockInfo();
}

module.exports = {
  claimBot,
  releaseBot,
  heartbeat,
  isBotActive,
  getActiveBot,
  getLockInfo,
  LOCK_FILE,
};
