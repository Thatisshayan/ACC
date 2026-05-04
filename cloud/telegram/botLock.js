// cloud/telegram/botLock.js
/**
 * Simple in-memory bot lock.
 * Only ONE bot (root or cloud) may poll Telegram at a time.
 * Replace with Redis/Supabase later without changing callers.
 */

let activeBot      = null; // "root" | "cloud" | null
let lastHeartbeat  = null;

/** claimBot — attempt to become the active bot */
function claimBot(botName) {
  if (!activeBot) {
    activeBot     = botName;
    lastHeartbeat = Date.now();
    return true;
  }
  return activeBot === botName;
}

/** releaseBot — stop being the active bot */
function releaseBot(botName) {
  if (activeBot === botName) {
    activeBot     = null;
    lastHeartbeat = null;
  }
}

/** heartbeat — called every few seconds by the active bot */
function heartbeat(botName) {
  if (activeBot === botName) {
    lastHeartbeat = Date.now();
  }
}

/** isBotActive */
function isBotActive(botName) {
  return activeBot === botName;
}

/** getActiveBot */
function getActiveBot() {
  return activeBot;
}

module.exports = { claimBot, releaseBot, heartbeat, isBotActive, getActiveBot };
