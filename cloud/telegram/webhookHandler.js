'use strict';
// cloud/telegram/webhookHandler.js
// Receives Telegram webhook updates and routes to real bot handlers
const express = require('express');
const router  = express.Router();
const { requireTelegramSecret } = require('../security/webhookHmac.js');
const { requireOperatorOrAdmin } = require('../middleware/auth.js');

router.post('/webhook/telegram', requireTelegramSecret(), async (req, res) => {
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
router.get('/webhook/telegram/info', requireOperatorOrAdmin, async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.json({ error: 'TELEGRAM_BOT_TOKEN not set' });
  const https = require('https');
  https.get('https://api.telegram.org/bot' + token + '/getWebhookInfo', function(r) {
    var d = '';
    r.on('data', function(c){ d+=c; });
    r.on('end', function(){ try { res.json(JSON.parse(d)); } catch(e){ res.json({raw:d}); } });
  }).on('error', function(e){ res.json({error:e.message}); });
});

// Register (or re-register) webhook with Telegram
// Body: { url? } — if omitted, derives from ACC_PUBLIC_URL / ACC_API_BASE_URL env vars
router.post('/webhook/telegram/register', requireOperatorOrAdmin, async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(400).json({ success: false, error: 'TELEGRAM_BOT_TOKEN not set' });

  const baseUrl = (req.body && req.body.url)
    || process.env.ACC_PUBLIC_URL
    || process.env.ACC_API_BASE_URL
    || '';

  if (!baseUrl) {
    return res.status(400).json({
      success: false,
      error: 'Provide url in request body or set ACC_PUBLIC_URL / ACC_API_BASE_URL',
    });
  }

  const webhookUrl  = baseUrl.replace(/\/+$/, '') + '/api/webhook/telegram';
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || '';

  const payload = JSON.stringify(Object.assign(
    { url: webhookUrl, allowed_updates: ['message', 'callback_query'] },
    secretToken ? { secret_token: secretToken } : {}
  ));

  const https = require('https');
  const request = https.request({
    hostname: 'api.telegram.org',
    path:     '/bot' + token + '/setWebhook',
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, function(r) {
    var d = '';
    r.on('data', function(c){ d += c; });
    r.on('end', function() {
      try {
        var parsed = JSON.parse(d);
        res.json({ success: !!parsed.ok, webhook_url: webhookUrl, telegram: parsed });
      } catch(e) {
        res.json({ success: false, raw: d });
      }
    });
  });
  request.on('error', function(e){ res.status(500).json({ success: false, error: e.message }); });
  request.write(payload);
  request.end();
});

module.exports = router;
