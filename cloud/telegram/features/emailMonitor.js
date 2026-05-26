// cloud/telegram/features/emailMonitor.js
// IMAP-based email monitor — works with Gmail (App Password), Outlook, Yahoo, any IMAP provider.
// No OAuth required. User sets up via Telegram: email + app password.
'use strict';

const fs   = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const users = require('../users.js');

var _sendFn = null;
function init(sendFunction) { _sendFn = sendFunction; }
function send(chatId, text) {
  if (_sendFn) return _sendFn(chatId, text).catch(function(e) { console.log('[emailMonitor] send err:', e.message); });
}

// ── IMAP host auto-detection ──────────────────────────────────────────────────

const IMAP_DEFAULTS = {
  'gmail.com':       { host: 'imap.gmail.com',          port: 993 },
  'googlemail.com':  { host: 'imap.gmail.com',          port: 993 },
  'outlook.com':     { host: 'outlook.office365.com',   port: 993 },
  'hotmail.com':     { host: 'outlook.office365.com',   port: 993 },
  'live.com':        { host: 'outlook.office365.com',   port: 993 },
  'msn.com':         { host: 'outlook.office365.com',   port: 993 },
  'yahoo.com':       { host: 'imap.mail.yahoo.com',     port: 993 },
  'ymail.com':       { host: 'imap.mail.yahoo.com',     port: 993 },
  'icloud.com':      { host: 'imap.mail.me.com',        port: 993 },
  'me.com':          { host: 'imap.mail.me.com',        port: 993 },
  'protonmail.com':  { host: '127.0.0.1',               port: 1143 }, // Bridge required
  'proton.me':       { host: '127.0.0.1',               port: 1143 },
};

function detectImapHost(email) {
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  return IMAP_DEFAULTS[domain] || { host: 'imap.' + domain, port: 993 };
}

// ── State persistence ─────────────────────────────────────────────────────────

function getMonitorFile(userId) {
  return path.join(users.getUserStorageDir(userId), 'email_monitor.json');
}

function getMonitorState(userId) {
  const fp = getMonitorFile(userId);
  if (!fs.existsSync(fp)) return { enabled: false, email: null, password: null, imapHost: null, imapPort: 993, lastChecked: null, seenIds: [] };
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (_) { return { enabled: false, email: null, password: null, imapHost: null, imapPort: 993, lastChecked: null, seenIds: [] }; }
}

function saveMonitorState(userId, state) {
  fs.mkdirSync(users.getUserStorageDir(userId), { recursive: true });
  fs.writeFileSync(getMonitorFile(userId), JSON.stringify(state, null, 2), 'utf8');
}

function disableMonitor(userId) {
  const state = getMonitorState(userId);
  state.enabled = false;
  saveMonitorState(userId, state);
}

// ── Connection test ───────────────────────────────────────────────────────────

async function testConnection(email, password, imapHost, imapPort) {
  const client = new ImapFlow({
    host:   imapHost,
    port:   imapPort,
    secure: true,
    auth:   { user: email, pass: password },
    logger: false,
    tls:    { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function enableMonitor(userId, email, password, imapHost, imapPort) {
  const test = await testConnection(email, password, imapHost, imapPort);
  if (!test.success) return test;

  const state = getMonitorState(userId);
  state.enabled   = true;
  state.email     = email;
  state.password  = password;
  state.imapHost  = imapHost;
  state.imapPort  = imapPort || 993;
  state.lastChecked = new Date().toISOString();
  saveMonitorState(userId, state);
  return { success: true };
}

// ── Job keyword filter ────────────────────────────────────────────────────────

const JOB_KEYWORDS = ['application', 'interview', 'offer', 'position', 'candidate', 'hiring', 'job', 'recruit', 'resume', 'cv', 'opportunity'];

function isJobRelated(subject, from) {
  const text = (subject + ' ' + from).toLowerCase();
  return JOB_KEYWORDS.some(function(k) { return text.includes(k); });
}

// ── Email check ───────────────────────────────────────────────────────────────

async function checkEmails(userId) {
  const state = getMonitorState(userId);
  if (!state.enabled || !state.email || !state.password) return [];

  const client = new ImapFlow({
    host:   state.imapHost || detectImapHost(state.email).host,
    port:   state.imapPort || 993,
    secure: true,
    auth:   { user: state.email, pass: state.password },
    logger: false,
    tls:    { rejectUnauthorized: false },
  });

  const results = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Fetch messages from last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const messages = client.fetch({ since }, { envelope: true, uid: true });
      const seenSet  = new Set(state.seenIds || []);

      for await (const msg of messages) {
        const uid = String(msg.uid);
        if (seenSet.has(uid)) continue;

        const subject = msg.envelope.subject || '';
        const from    = (msg.envelope.from || []).map(function(f) { return (f.name || '') + ' <' + (f.address || '') + '>'; }).join(', ');

        if (!isJobRelated(subject, from)) continue;

        results.push({ id: uid, subject, from, snippet: subject });
        seenSet.add(uid);
      }

      state.seenIds = Array.from(seenSet).slice(-200);
      state.lastChecked = new Date().toISOString();
      saveMonitorState(userId, state);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.log('[emailMonitor] IMAP error for user', userId, ':', err.message);
  }

  return results;
}

// ── Polling all enabled users ─────────────────────────────────────────────────

async function pollAll() {
  const allUsers = users.getAllUsers().filter(function(u) {
    const s = getMonitorState(u.id);
    return s.enabled && s.email && s.password;
  });

  for (const user of allUsers) {
    try {
      const emails = await checkEmails(user.id);
      for (const email of emails) {
        const lang = user.language || 'en';
        let msg = lang === 'fa'
          ? '📧 *ایمیل جدید مرتبط با شغل!*\n\n'
          : '📧 *New job-related email!*\n\n';
        msg += '*From:* ' + email.from.split('<')[0].trim() + '\n';
        msg += '*Subject:* ' + email.subject + '\n\n';
        msg += lang === 'fa'
          ? '_می‌خواهی پاسخ پیش‌نویسی کنم؟_'
          : '_Want me to draft a reply?_';
        await send(user.id, msg);
      }
    } catch (err) {
      console.log('[emailMonitor] Error for user', user.id, ':', err.message);
    }
  }
}

var _interval = null;
function startPolling(intervalMinutes) {
  intervalMinutes = intervalMinutes || 5;
  _interval = setInterval(function() { pollAll().catch(function(e) { console.log('[emailMonitor] poll err:', e.message); }); }, intervalMinutes * 60 * 1000);
  console.log('[emailMonitor] Polling every ' + intervalMinutes + ' minutes');
}
function stopPolling() { if (_interval) { clearInterval(_interval); _interval = null; } }

module.exports = { init, enableMonitor, disableMonitor, getMonitorState, checkEmails, detectImapHost, testConnection, startPolling, stopPolling };
