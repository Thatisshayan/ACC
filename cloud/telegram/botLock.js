// cloud/telegram/botLock.js
/**
 * File-backed singleton lock for Telegram polling.
 * Only ONE bot (root or cloud) may poll Telegram at a time.
 *
 * This replaces the old in-memory-only lock so separate Windows processes
 * cannot both claim the bot at the same time.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RUN_DIR = path.join(__dirname, '../../data/run');
const LOCK_PATH = path.join(RUN_DIR, 'telegram-bot.lock.json');

let activeBot = null; // "root" | "cloud" | null
let lastHeartbeat = null;

function ensureRunDir() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
}

function isProcessAlive(pid) {
  const parsed = Number(pid);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  try {
    process.kill(parsed, 0);
    return true;
  } catch (err) {
    return false;
  }
}

function readLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return null;
    const raw = fs.readFileSync(LOCK_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

function cleanupStaleLock() {
  const existing = readLock();
  if (!existing) return null;
  if (isProcessAlive(existing.pid)) return existing;
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch (err) {
    // best effort only
  }
  return null;
}

function writeLock(botName) {
  ensureRunDir();
  const payload = {
    botName: String(botName || 'cloud'),
    pid: process.pid,
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2), { flag: 'w' });
  return payload;
}

function claimBot(botName) {
  const existing = cleanupStaleLock();
  if (existing && existing.botName && existing.pid) {
    if (existing.botName === botName && Number(existing.pid) === process.pid) {
      activeBot = botName;
      lastHeartbeat = Date.now();
      return true;
    }
    return false;
  }

  try {
    const payload = writeLock(botName);
    activeBot = payload.botName;
    lastHeartbeat = Date.now();
    return true;
  } catch (err) {
    const retry = cleanupStaleLock();
    if (retry) return false;
    try {
      const payload = writeLock(botName);
      activeBot = payload.botName;
      lastHeartbeat = Date.now();
      return true;
    } catch (innerErr) {
      return false;
    }
  }
}

function releaseBot(botName) {
  const existing = readLock();
  if (existing && existing.botName === botName && Number(existing.pid) === process.pid) {
    try {
      fs.unlinkSync(LOCK_PATH);
    } catch (err) {
      // best effort only
    }
  }
  if (activeBot === botName) {
    activeBot = null;
    lastHeartbeat = null;
  }
}

function heartbeat(botName) {
  const existing = readLock();
  if (!existing) return;
  if (existing.botName !== botName || Number(existing.pid) !== process.pid) return;
  lastHeartbeat = Date.now();
  try {
    writeLock(botName);
  } catch (err) {
    // best effort only
  }
}

function isBotActive(botName) {
  const existing = readLock();
  if (!existing) return activeBot === botName;
  if (existing.botName !== botName) return false;
  return isProcessAlive(existing.pid);
}

function getActiveBot() {
  const existing = cleanupStaleLock();
  if (existing && existing.botName) {
    return existing.botName;
  }
  return activeBot;
}

function getLockInfo() {
  const existing = cleanupStaleLock();
  if (!existing) {
    return { activeBot: null, pid: null, heartbeatAt: null, startedAt: null };
  }
  return {
    activeBot: existing.botName || null,
    pid: Number(existing.pid) || null,
    heartbeatAt: existing.heartbeatAt || null,
    startedAt: existing.startedAt || null,
  };
}

module.exports = { claimBot, releaseBot, heartbeat, isBotActive, getActiveBot, getLockInfo };
