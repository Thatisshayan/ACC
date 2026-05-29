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
const twilio  = require('../connectors/twilio.js');
const fetch   = require('node-fetch');
const { log } = require('../utils/logger.js');

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
    const result = await twilio.sendSMS(to, message);
    log(`[phone] SMS sent by ${agent || 'manual'} to ${to}: ${message.slice(0, 50)}`);
    return res.json({ success: true, sid: result.sid, status: result.status, to, from: result.from });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/phone/call  — { to: "+16135551234", message: "..." }
router.post('/call', async (req, res) => {
  const { to, message, agent } = req.body || {};
  if (!to || !message) return res.status(400).json({ success: false, error: 'to and message are required.' });
  const twiml = `<Response><Say voice="Polly.Matthew">${message}</Say></Response>`;
  try {
    const result = await twilio.makeCall(to, twiml);
    log(`[phone] Call initiated by ${agent || 'manual'} to ${to}`);
    return res.json({ success: true, sid: result.sid, status: result.status, to });
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
router.post('/webhook/sms', async (req, res) => {
  const from = req.body?.From;
  const body = req.body?.Body;
  const to   = req.body?.To;

  log(`[phone] Inbound SMS from ${from}: ${body}`);

  // Forward to Shayan on Telegram
  await notifyTelegram(`📱 *Inbound SMS*\n\n*From:* \`${from}\`\n*To:* ${to}\n*Message:* ${body}`).catch(e =>
    log('[phone] Telegram notify failed:', e.message)
  );

  // Respond with empty TwiML (no auto-reply)
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

// POST /api/phone/webhook/voice — Twilio calls this on inbound call
router.post('/webhook/voice', async (req, res) => {
  const from = req.body?.From;
  log(`[phone] Inbound call from ${from}`);

  await notifyTelegram(`📞 *Inbound Call*\n\n*From:* \`${from}\`\nCall routed to voicemail.`).catch(e =>
    log('[phone] Telegram notify failed:', e.message)
  );

  res.set('Content-Type', 'text/xml');
  res.send(`<Response><Say voice="Polly.Matthew">You've reached ACC Agent Command Center. Please leave a message after the tone.</Say><Record maxLength="60" /></Response>`);
});

async function notifyTelegram(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.SHAYAN_TELEGRAM_CHAT_ID || process.env.SAYAN_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

module.exports = router;
