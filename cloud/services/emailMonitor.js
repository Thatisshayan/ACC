'use strict';
// cloud/services/emailMonitor.js
// IMAP email monitoring: store credentials, poll inbox, summarize via AI, notify Telegram.
// Requires: imapflow (already in package.json)

const { ImapFlow } = require('imapflow');
const { log, warn, error: logError, safeErrorMessage } = require('../utils/logger.js');
const { encryptObject, decryptObject } = require('../messages/encryption.js');

// Encrypt/decrypt the IMAP app password with the same AES-256-GCM helper the
// messenger uses, instead of the base64 "encoding" this used to do (trivially
// reversible — not encryption at all). decodePassword() falls back to the old
// base64 format for credentials saved before this change so they don't break;
// every save from here on writes the real encrypted envelope.
function encodePassword(password) {
  return JSON.stringify(encryptObject({ password }));
}

function decodePassword(stored) {
  try {
    const envelope = JSON.parse(stored);
    if (envelope && envelope.alg === 'aes-256-gcm') {
      const payload = decryptObject(envelope);
      if (payload && typeof payload.password === 'string') return payload.password;
    }
  } catch {
    // not JSON — fall through to legacy base64 format below
  }
  return Buffer.from(stored, 'base64').toString('utf8');
}

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

  const password_enc = encodePassword(password);

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
  const password = decodePassword(cred.password_enc);

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
    // e came from a client constructed with a password; don't forward the
    // library's own error text (some IMAP servers echo the failed AUTH exchange
    // back into it) — log a safe summary only.
    logError('[emailMonitor] IMAP poll error for', cred.email, ':', safeErrorMessage(e));
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
  // Escape literal backslashes FIRST: MarkdownV2 uses "\" as its own escape
  // character, so a "\" already present in the input (e.g. a crafted email
  // subject) has to become "\\" before any other character gets a "\" prefix —
  // otherwise a backslash immediately followed by a special char could combine
  // into what Telegram reads as an escaped backslash + an unescaped special
  // char, breaking back out of the intended plain-text formatting.
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
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
