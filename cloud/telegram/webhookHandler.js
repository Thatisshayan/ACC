'use strict';
// cloud/telegram/webhookHandler.js
// Receives Telegram webhook updates and routes to real bot handlers
const express = require('express');
const router  = express.Router();

router.post('/webhook/telegram', async (req, res) => {
  // Always return 200 immediately — Telegram requires this
  res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (!update) return;

    // Route to real bot handlers (set by scripts/start.js)
    const handleMessage  = global.__accBotHandleMessage;
    const handleCallback = global.__accBotHandleCallback;

    if (update.message && typeof handleMessage === 'function') {
      await handleMessage(update.message).catch(function(e) {
        console.error('[webhook] handleMessage error:', e.message);
      });
    }

    if (update.callback_query && typeof handleCallback === 'function') {
      await handleCallback(update.callback_query).catch(function(e) {
        console.error('[webhook] handleCallback error:', e.message);
      });
    }

    if (!handleMessage && !handleCallback) {
      console.warn('[webhook] Bot handlers not loaded yet. Update dropped:', update.update_id);
    }

  } catch(e) {
    console.error('[webhook] Error processing update:', e.message);
  }
});

// Info endpoint — check webhook status
router.get('/webhook/telegram/info', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.json({ error: 'TELEGRAM_BOT_TOKEN not set' });
  const https = require('https');
  https.get('https://api.telegram.org/bot' + token + '/getWebhookInfo', function(r) {
    var d = '';
    r.on('data', function(c){ d+=c; });
    r.on('end', function(){ try { res.json(JSON.parse(d)); } catch(e){ res.json({raw:d}); } });
  }).on('error', function(e){ res.json({error:e.message}); });
});

module.exports = router;
