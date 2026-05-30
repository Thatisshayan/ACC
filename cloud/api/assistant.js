'use strict';

const express = require('express');
const messages = require('../messages/service.js');
const { getBridgeStatus } = require('../services/alphonsoBridgeService.js');
const store = require('../taskbus/store.js');
const botLock = require('../telegram/botLock.js');

const router = express.Router();

function resolveUserId(req) {
  return String(req.body?.userId || req.query?.userId || req.headers['x-acc-user-id'] || '').trim();
}

function buildSystemStatus() {
  const stats = store.getStats ? store.getStats() : {};
  const bot = botLock.getLockInfo ? botLock.getLockInfo() : { activeBot: null, pid: null };
  const bridge = getBridgeStatus ? getBridgeStatus() : {};
  const messenger = messages.getStatus();

  return {
    success: true,
    overall: bot.healthy && messenger.status === 'ready' ? 'ok' : 'partial',
    backend: {
      status: 'ok',
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
    },
    bot: {
      status: bot.healthy ? 'active' : 'inactive',
      lock: bot,
    },
    bridge,
    messenger,
    taskbus: {
      status: 'ok',
      totalTasks: stats.total_tasks || 0,
      pendingApprovals: stats.pending_approvals || 0,
      byStatus: stats.by_status || {},
    },
    timestamp: new Date().toISOString(),
  };
}

router.post('/parse', function(req, res) {
  try {
    const text = String(req.body?.text || req.body?.prompt || '').trim();
    const parsed = messages.parseAssistantIntent(text);
    res.json({
      success: true,
      text,
      parsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/execute', async function(req, res) {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    const parsed = messages.parseAssistantIntent(req.body?.text || req.body?.prompt || '');
    const result = await messages.executeAssistantIntent({
      userId,
      text: req.body?.text || req.body?.prompt || '',
      intent: req.body?.intent || parsed.intent,
      arguments: req.body?.arguments || parsed.arguments || {},
      recipientId: req.body?.recipientId || '',
      recipientQuery: req.body?.recipientQuery || '',
      content: req.body?.content || '',
      subject: req.body?.subject || '',
      attachments: req.body?.attachments || [],
      senderType: req.body?.senderType || 'user',
      transport: req.body?.transport || 'in_app',
      meta: req.body?.meta || {},
    });
    res.json(Object.assign({ timestamp: new Date().toISOString() }, result));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status', function(req, res) {
  try {
    res.json(buildSystemStatus());
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assistant/transcribe
// Body: { audio: "<base64>", mimeType: "audio/m4a" }  (from mobile mic)
// Returns: { success, text, intent, parsed }
router.post('/transcribe', async function(req, res) {
  try {
    const { audio, mimeType = 'audio/m4a' } = req.body || {};
    if (!audio) return res.status(400).json({ success: false, error: 'audio (base64) is required' });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(503).json({ success: false, error: 'Voice transcription not configured' });

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: key });

    const buf = Buffer.from(audio, 'base64');
    const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
               : mimeType.includes('webm') ? 'webm'
               : mimeType.includes('ogg')  ? 'ogg'
               : 'wav';

    const { toFile } = require('openai');
    const file = await toFile(buf, `voice.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
    });

    const text = transcription.text || '';
    const parsed = messages.parseAssistantIntent(text);

    res.json({ success: true, text, parsed, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
