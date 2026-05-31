'use strict';
// cloud/api/emailRoutes.js — email monitoring CRUD + test
// Mount at: app.use('/api/email', require('./api/emailRoutes'))

const express = require('express');
const router  = express.Router();
const mon     = require('../services/emailMonitor.js');
const { log } = require('../utils/logger.js');

// GET /api/email/credentials?userId=...
router.get('/credentials', async (req, res) => {
  const userId = req.query.userId || req.query.user_id || 'default';
  try {
    const creds = await mon.loadCredentials(userId);
    return res.json({ success: true, credentials: creds.map(c => ({
      id: c.id, email: c.email, provider: c.provider, enabled: c.enabled, last_polled: c.last_polled,
    }))});
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/email/credentials — save IMAP credential
router.post('/credentials', async (req, res) => {
  const { userId = 'default', email, password, provider, imapHost, imapPort } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'email and password are required' });
  }
  try {
    await mon.saveCredential({ userId, email, password, provider, imapHost, imapPort });
    return res.json({ success: true, message: `Credential saved for ${email}` });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/email/credentials/:id
router.delete('/credentials/:id', async (req, res) => {
  try {
    await mon.deleteCredential(req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/email/test — test IMAP connection without saving
router.post('/test', async (req, res) => {
  const { email, password, imapHost, imapPort } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'email and password are required' });
  }
  try {
    const result = await mon.testConnection({ email, password, imapHost, imapPort });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/email/poll — manually trigger poll for a credential
router.post('/poll', async (req, res) => {
  const { userId = 'default', chatId } = req.body || {};
  try {
    const creds = await mon.loadCredentials(userId);
    if (creds.length === 0) return res.json({ success: true, message: 'No credentials configured', emails: [] });

    const all = [];
    for (const cred of creds) {
      try {
        const messages = await mon.pollInbox(cred);
        if (chatId && messages.length) {
          await mon.sendEmailSummaryToTelegram(chatId, cred.email, messages);
        }
        all.push({ email: cred.email, count: messages.length, messages });
      } catch (e) {
        log('[emailRoutes] poll error for', cred.email, ':', e.message);
        all.push({ email: cred.email, error: e.message });
      }
    }
    return res.json({ success: true, results: all });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
