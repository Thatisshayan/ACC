'use strict';
// cloud/api/phoneRoutes.js — Agent phone connector (Twilio)
// Mount: app.use('/api/phone', require('./api/phoneRoutes'))
//
// Endpoints:
//   GET  /api/phone/status          — check Twilio config + account info
//   POST /api/phone/sms             — send SMS: { to, message }
//   POST /api/phone/call            — make call: { to, message }
//   GET  /api/phone/messages        — recent messages log
//   POST /api/phone/webhook/sms     — Twilio inbound SMS webhook (set in Twilio console)
//   POST /api/phone/webhook/voice   — Twilio inbound voice webhook

const express = require('express');
const router  = express.Router();
router.use(express.urlencoded({ extended: true }));
const rateLimit = require('express-rate-limit');
const twilio  = require('../connectors/twilio.js');
const store   = require('../taskbus/store.js');
const { routeTask } = require('../taskbus/router.js');
const fetch   = require('node-fetch');
const { log } = require('../utils/logger.js');
const twilioSdk = require('twilio');
const { requireOperatorOrAdmin } = require('../middleware/auth.js');

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Dedicated, stricter budget on top of the app-wide limiter in server.js — this
// router's own middleware performs the operator/admin auth check, so it's worth
// slowing credential-guessing against it specifically, not just relying on the
// generic per-IP request budget everything else shares.
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

function maskPhone(input) {
  const value = String(input || '');
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

function requireTwilioWebhookSignature(req, res, next) {
  const signature = req.headers['x-twilio-signature'];
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!signature || !authToken) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    return next();
  }

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const url = `${protocol}://${host}${req.originalUrl}`;
  const valid = twilioSdk.validateRequest(authToken, signature, url, req.body || {});
  if (!valid) return res.status(401).json({ success: false, error: 'Unauthorized' });
  return next();
}

function buildPhoneTask(body, type) {
  const action = type === 'sms' ? 'send_sms' : 'make_call';
  const title = type === 'sms'
    ? `Send SMS to ${maskPhone(body.to)}`
    : `Place call to ${maskPhone(body.to)}`;
  const twiml = type === 'call'
    ? `<Response><Say voice="Polly.Matthew">${escapeXml(body.message)}</Say></Response>`
    : null;

  return store.createTask({
    title,
    instruction: type === 'sms'
      ? 'Send an external SMS through Twilio after operator approval.'
      : 'Place an external phone call through Twilio after operator approval.',
    assigned_agent: 'twilio',
    priority: body.priority || 'high',
    required_output: type === 'sms' ? 'Twilio SMS SID and delivery status' : 'Twilio call SID and initiation status',
    approval_required: true,
    automation_mode: 'semi_auto',
    feature_ref: type === 'sms' ? 'api:phone:sms' : 'api:phone:call',
    created_by: body.agent || 'manual',
    request_id: body.request_id || null,
    meta: {
      twilio: {
        action,
        params: {
          to: body.to,
          message: body.message,
          twiml,
        },
      },
    },
  });
}

function isPublicPhoneRoute(req) {
  return req.path.startsWith('/webhook/');
}
router.use((req, res, next) => (isPublicPhoneRoute(req) ? next() : authLimiter(req, res, next)));
router.use((req, res, next) => (isPublicPhoneRoute(req) ? next() : requireOperatorOrAdmin(req, res, next)));

// GET /api/phone/status
router.get('/status', async (req, res) => {
  const configured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
  if (!configured) {
    return res.json({ success: true, configured: false, message: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.' });
  }
  try {
    const account = await twilio.getAccountInfo();
    return res.json({ success: true, configured: true, phoneNumber: process.env.TWILIO_PHONE_NUMBER, accountName: account.friendly_name, status: account.status });
  } catch (e) {
    return res.status(500).json({ success: false, configured: true, error: e.message });
  }
});

// POST /api/phone/sms  — { to: "+16135551234", message: "..." }
router.post('/sms', async (req, res) => {
  const { to, message, agent } = req.body || {};
  if (!to || !message) return res.status(400).json({ success: false, error: 'to and message are required.' });
  try {
    const task = buildPhoneTask(req.body || {}, 'sms');
    const routing = await routeTask(task.id);
    log(`[phone] SMS task queued by ${agent || 'manual'} to ${maskPhone(to)} (content redacted)`);
    return res.json({ success: true, task, routing });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/phone/call  — { to: "+16135551234", message: "..." }
router.post('/call', async (req, res) => {
  const { to, message, agent } = req.body || {};
  if (!to || !message) return res.status(400).json({ success: false, error: 'to and message are required.' });
  try {
    const task = buildPhoneTask(req.body || {}, 'call');
    const routing = await routeTask(task.id);
    log(`[phone] Call task queued by ${agent || 'manual'} to ${maskPhone(to)}`);
    return res.json({ success: true, task, routing });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/phone/messages
router.get('/messages', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const messages = await twilio.listMessages(limit);
    return res.json({ success: true, count: messages.length, messages });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/phone/webhook/sms — Twilio calls this on inbound SMS
// Set in Twilio console: Messaging → Phone Number → "A Message Comes In" → Webhook
router.post('/webhook/sms', requireTwilioWebhookSignature, async (req, res) => {
  const from = req.body?.From;
  const body = req.body?.Body;
  const to   = req.body?.To;

  log(`[phone] Inbound SMS from ${maskPhone(from)} (content redacted)`);

  // Forward to Shayan on Telegram
  await notifyTelegram(`📱 *Inbound SMS*\n\n*From:* \`${from}\`\n*To:* ${to}\n*Message:* ${body}`).catch(e =>
    log('[phone] Telegram notify failed:', e.message)
  );

  // Respond with empty TwiML (no auto-reply)
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

// POST /api/phone/webhook/voice — Twilio calls this on inbound call
router.post('/webhook/voice', requireTwilioWebhookSignature, async (req, res) => {
  const from = req.body?.From;
  log(`[phone] Inbound call from ${maskPhone(from)}`);

  await notifyTelegram(`📞 *Inbound Call*\n\n*From:* \`${from}\`\nCall routed to voicemail.`).catch(e =>
    log('[phone] Telegram notify failed:', e.message)
  );

  res.set('Content-Type', 'text/xml');
  res.send(`<Response><Say voice="Polly.Matthew">You've reached ACC Agent Command Center. Please leave a message after the tone.</Say><Record maxLength="60" /></Response>`);
});

async function notifyTelegram(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ACC_OWNER_TELEGRAM_CHAT_ID || process.env.SHAYAN_TELEGRAM_CHAT_ID || process.env.SAYAN_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

module.exports = router;
