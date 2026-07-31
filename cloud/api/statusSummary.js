'use strict';

const express = require('express');
const store = require('../taskbus/store.js');
const botLock = require('../telegram/botLock.js');
const { getBridgeStatus } = require('../services/alphonsoBridgeService.js');
const messages = require('../messages/service.js');

function providerHealth() {
  return {
    deepseek: { configured: !!process.env.DEEPSEEK_API_KEY,  note: process.env.DEEPSEEK_API_KEY  ? 'key set' : 'DEEPSEEK_API_KEY missing'  },
    openai:   { configured: !!process.env.OPENAI_API_KEY,    note: process.env.OPENAI_API_KEY    ? 'key set' : 'OPENAI_API_KEY missing'    },
    gemini:   { configured: !!process.env.GEMINI_API_KEY,    note: process.env.GEMINI_API_KEY    ? 'key set' : 'GEMINI_API_KEY missing'    },
    claude:   { configured: !!process.env.CLAUDE_API_KEY,    note: 'disabled — credits depleted' },
  };
}

const router = express.Router();

function safeStats() {
  try {
    return store.getStats ? store.getStats() : {};
  } catch (err) {
    return {};
  }
}

function buildSummary() {
  const bot = botLock.getLockInfo ? botLock.getLockInfo() : { activeBot: null, pid: null };
  const bridge = getBridgeStatus ? getBridgeStatus() : {};
  const stats = safeStats();
  const messenger = messages.getStatus ? messages.getStatus() : { status: 'unknown' };
  const backendStatus = 'ok';
  const botActive = Boolean(bot.healthy);
  const bridgeReady = bridge.status === 'configured';
  const messengerReady = messenger.status === 'ready';

  let overall = 'degraded';
  if (backendStatus === 'ok' && botActive && bridgeReady && messengerReady) {
    overall = 'healthy';
  } else if (backendStatus === 'ok' && (botActive || bridgeReady || messengerReady)) {
    overall = 'partial';
  }

  return {
    success: true,
    overall,
    timestamp: new Date().toISOString(),
    backend: {
      status: backendStatus,
      port: Number(process.env.PORT || 4000),
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
    },
    bot: {
      status: botActive ? 'active' : 'inactive',
      lock: bot,
      lockFile: 'data/run/telegram-bot.lock.json',
    },
    messenger: messenger,
    bridge: bridge,
    taskbus: {
      status: 'ok',
      totalTasks: stats.total_tasks || 0,
      pendingApprovals: stats.pending_approvals || 0,
      byStatus: stats.by_status || {},
      byAgent: stats.by_agent || {},
    },
    providers: providerHealth(),
    notes: [
      'Backend truth comes from the live route itself.',
      'Bot truth comes from the file-backed lock.',
      'Messenger truth comes from the encrypted private message store.',
      'Bridge truth comes from the Alphonso bridge service.',
      'Task Bus truth comes from the persisted task store.',
    ],
  };
}

router.get('/', function(req, res) {
  res.json(buildSummary());
});

router.get('/summary', function(req, res) {
  res.json(buildSummary());
});

router.get('/providers', function(req, res) {
  res.json({ success: true, providers: providerHealth() });
});

module.exports = router;
