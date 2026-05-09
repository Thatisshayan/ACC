// cloud/telegram/features/emailMonitor.js — Feature 12: Gmail Email Monitoring
// Polls Gmail for job application replies and alerts via Telegram
'use strict';

const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const users = require('../users.js');

var _sendFn = null;
function init(sendFunction) { _sendFn = sendFunction; }
function send(chatId, text) {
  if (_sendFn) return _sendFn(chatId, text).catch(function(e) { console.log('[emailMonitor] err:', e.message); });
}

function getMonitorFile(userId) {
  return path.join(users.getUserStorageDir(userId), 'email_monitor.json');
}

function getMonitorState(userId) {
  const fp = getMonitorFile(userId);
  if (!fs.existsSync(fp)) return { enabled: false, gmailToken: null, lastChecked: null, seenIds: [] };
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(_) { return { enabled: false, gmailToken: null, lastChecked: null, seenIds: [] }; }
}

function saveMonitorState(userId, state) {
  fs.writeFileSync(getMonitorFile(userId), JSON.stringify(state, null, 2), 'utf8');
}

function enableMonitor(userId, gmailToken) {
  const state = getMonitorState(userId);
  state.enabled    = true;
  state.gmailToken = gmailToken;
  state.lastChecked = new Date().toISOString();
  saveMonitorState(userId, state);
}

function disableMonitor(userId) {
  const state = getMonitorState(userId);
  state.enabled = false;
  saveMonitorState(userId, state);
}

// Check Gmail for new job-related replies
async function checkEmails(userId) {
  const state = getMonitorState(userId);
  if (!state.enabled || !state.gmailToken) return [];

  // Job-related keywords to look for in subjects/senders
  const keywords = ['application', 'interview', 'offer', 'position', 'role', 'candidate', 'hiring', 'job', 'recruit'];

  try {
    // Gmail API - list messages matching job keywords
    const query = keywords.map(function(k) { return 'subject:' + k; }).join(' OR ') + ' newer_than:1d';
    const listRes = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
      headers: { Authorization: 'Bearer ' + state.gmailToken },
      params:  { q: query, maxResults: 10 },
      timeout: 10000,
    });

    const messages = listRes.data.messages || [];
    const newEmails = messages.filter(function(m) { return !state.seenIds.includes(m.id); });

    const results = [];
    for (const msg of newEmails.slice(0, 3)) {
      const detail = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msg.id, {
        headers: { Authorization: 'Bearer ' + state.gmailToken },
        params:  { format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] },
        timeout: 10000,
      });
      const headers = detail.data.payload.headers || [];
      const subject = (headers.find(function(h){return h.name==='Subject';}) || {}).value || 'No subject';
      const from    = (headers.find(function(h){return h.name==='From';}) || {}).value || 'Unknown';
      results.push({ id: msg.id, subject, from, snippet: detail.data.snippet || '' });
      state.seenIds.push(msg.id);
    }

    state.lastChecked = new Date().toISOString();
    if (state.seenIds.length > 200) state.seenIds = state.seenIds.slice(-100);
    saveMonitorState(userId, state);
    return results;
  } catch(e) {
    console.log('[emailMonitor] Gmail API error:', e.message);
    return [];
  }
}

// Poll all users with monitoring enabled
async function pollAll() {
  const allUsers = users.getAllUsers().filter(function(u) {
    const state = getMonitorState(u.id);
    return state.enabled && state.gmailToken;
  });

  for (const user of allUsers) {
    try {
      const emails = await checkEmails(user.id);
      for (const email of emails) {
        const lang = user.language || 'en';
        var msg = lang === 'fa'
          ? '📧 *ایمیل جدید دریافت شد!*\n\n'
          : '📧 *New job-related email!*\n\n';
        msg += '*From:* ' + email.from.split('<')[0].trim() + '\n';
        msg += '*Subject:* ' + email.subject + '\n';
        msg += '*Preview:* ' + email.snippet.slice(0, 150) + '\n\n';
        msg += lang === 'fa'
          ? '_می‌خواهی پاسخ پیش‌نویسی کنم؟_'
          : '_Want me to draft a reply?_';
        await send(user.id, msg);
      }
    } catch(e) {
      console.log('[emailMonitor] Error for user', user.id, ':', e.message);
    }
  }
}

// Gmail OAuth URL generator
function getAuthUrl(userId) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) return null;
  const redirect = 'https://your-acc-domain.com/oauth/gmail/callback';
  const scope    = 'https://www.googleapis.com/auth/gmail.readonly';
  return 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + clientId + '&redirect_uri=' + encodeURIComponent(redirect) + '&response_type=code&scope=' + encodeURIComponent(scope) + '&state=' + userId + '&access_type=offline';
}

var _interval = null;
function startPolling(intervalMinutes) {
  intervalMinutes = intervalMinutes || 5;
  _interval = setInterval(function() { pollAll().catch(function(e) { console.log('[emailMonitor] poll err:', e.message); }); }, intervalMinutes * 60 * 1000);
  console.log('[emailMonitor] Polling every ' + intervalMinutes + ' minutes');
}
function stopPolling() { if (_interval) { clearInterval(_interval); _interval = null; } }

module.exports = { init, enableMonitor, disableMonitor, getMonitorState, checkEmails, getAuthUrl, startPolling, stopPolling };
