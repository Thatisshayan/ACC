'use strict';
// cloud/services/emailMonitor.js
// IMAP email monitoring: store credentials, poll inbox, summarize via AI, notify Telegram.
// Requires: imapflow (already in package.json)

const { ImapFlow } = require('imapflow');
const { log, warn, error: logError } = require('../utils/logger.js');

let _db = null;
function db() {
  if (_db) return _db;
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    _db = createClient(url, key);
  } catch { _db = null; }
  return _db;
}

// ── Credential management ─────────────────────────────────────────────────────

async function saveCredential({ userId, email, password, provider = 'gmail', imapHost, imapPort }) {
  const client = db();
  if (!client) throw new Error('Supabase not configured');

  const host = imapHost || (provider === 'gmail' ? 'imap.gmail.com' : 'imap.mail.yahoo.com');
  const port = imapPort || 993;

  // Simple XOR obfuscation — replace with proper AES-256 if you add a vault key
  const password_enc = Buffer.from(password).toString('base64');

  const now = new Date().toISOString();
  const { error } = await client.from('acc_email_credentials').upsert({
    user_id:      userId,
    provider,
    imap_host:    host,
    imap_port:    port,
    email,
    password_enc,
    enabled:      true,
    updated_at:   now,
  }, { onConflict: 'user_id,email' });

  if (error) throw new Error(error.message);
  log('[emailMonitor] credential saved for', email);
}

async function loadCredentials(userId) {
  const client = db();
  if (!client) return [];
  const { data, error } = await client
    .from('acc_email_credentials')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true);
  if (error) { logError('[emailMonitor] loadCredentials:', error.message); return []; }
  return data || [];
}

async function deleteCredential(id) {
  const client = db();
  if (!client) throw new Error('Supabase not configured');
  const { error } = await client.from('acc_email_credentials').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── IMAP polling ──────────────────────────────────────────────────────────────

async function pollInbox(cred) {
  const password = Buffer.from(cred.password_enc, 'base64').toString('utf8');

  const client = new ImapFlow({
    host:   cred.imap_host,
    port:   cred.imap_port,
    secure: true,
    auth:   { user: cred.email, pass: password },
    logger: false,
  });

  const messages = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Fetch last 10 unseen emails
      for await (const msg of client.fetch('1:10', { envelope: true, flags: true })) {
        if (!msg.flags.has('\\Seen')) {
          messages.push({
            subject: msg.envelope.subject || '(no subject)',
            from:    msg.envelope.from?.[0]?.address || 'unknown',
            date:    msg.envelope.date,
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    logError('[emailMonitor] IMAP poll error for', cred.email, ':', e.message);
    throw e;
  }

  // Update last_polled timestamp
  const dbClient = db();
  if (dbClient) {
    await dbClient.from('acc_email_credentials')
      .update({ last_polled: new Date().toISOString() })
      .eq('id', cred.id);
  }

  return messages;
}

// ── Telegram summary ──────────────────────────────────────────────────────────

async function sendEmailSummaryToTelegram(chatId, email, messages) {
  if (!messages.length) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;

  const lines = messages.slice(0, 5).map(m =>
    `• *${escTg(m.subject)}*\n  From: ${escTg(m.from)}`
  ).join('\n');

  const text = `📬 *New emails for ${escTg(email)}*\n\n${lines}\n\n_${messages.length} unread email(s). Reply /email stop to unsubscribe._`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(e => logError('[emailMonitor] Telegram send error:', e.message));
}

function escTg(str) {
  return String(str || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ── Test connection ───────────────────────────────────────────────────────────

async function testConnection({ email, password, imapHost = 'imap.gmail.com', imapPort = 993 }) {
  const client = new ImapFlow({
    host:   imapHost,
    port:   imapPort,
    secure: true,
    auth:   { user: email, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { success: true, message: 'Connection successful' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  saveCredential,
  loadCredentials,
  deleteCredential,
  pollInbox,
  sendEmailSummaryToTelegram,
  testConnection,
};
