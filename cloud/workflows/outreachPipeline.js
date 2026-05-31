'use strict';

const hunter = require('../integrations/hunter.js');
const resend  = require('../integrations/resend.js');
const axios   = require('axios');
const fs      = require('fs').promises;
const path    = require('path');
const { log, warn } = require('../utils/logger.js');

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

// ── Deduplication ─────────────────────────────────────────────────────────────

async function isAlreadySent(toAddress, campaignId) {
  const client = db();
  if (!client) return false;
  const q = client.from('acc_sent_emails').select('id').eq('to_address', toAddress).eq('unsubscribed', false);
  if (campaignId) q.eq('campaign_id', campaignId);
  const { data } = await q.limit(1);
  return (data || []).length > 0;
}

async function isUnsubscribed(toAddress) {
  const client = db();
  if (!client) return false;
  const { data } = await client.from('acc_sent_emails').select('id').eq('to_address', toAddress).eq('unsubscribed', true).limit(1);
  return (data || []).length > 0;
}

async function recordSent({ to_address, subject, campaign_id }) {
  const client = db();
  if (!client) return;
  await client.from('acc_sent_emails').insert({ to_address, subject, campaign_id, status: 'sent' }).catch(() => {});
}

// POST /api/email/unsubscribe?email=... marks the address as unsubscribed
async function markUnsubscribed(toAddress) {
  const client = db();
  if (!client) return;
  await client.from('acc_sent_emails')
    .update({ unsubscribed: true })
    .eq('to_address', toAddress)
    .catch(() => {});
}

// ── Telegram approval ─────────────────────────────────────────────────────────

async function requestTelegramApproval(lead, subject, emailBody) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    warn('[outreach] TELEGRAM_BOT_TOKEN or TELEGRAM_OWNER_CHAT_ID not set — skipping approval, sending directly');
    return 'approved';
  }

  const preview = emailBody.slice(0, 300) + (emailBody.length > 300 ? '…' : '');
  const text = `📧 *Outreach Approval Required*\n\n` +
    `*To:* ${lead.email || '?'}\n*Name:* ${lead.name}\n*Company:* ${lead.company}\n` +
    `*Subject:* ${subject}\n\n*Preview:*\n${preview}\n\n` +
    `Reply:\n✅ /approve_outreach_${lead._approvalId}\n❌ /reject_outreach_${lead._approvalId}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });

  if (!res.ok) {
    warn('[outreach] Telegram message send failed:', await res.text());
    return 'approved'; // fallback: send anyway
  }

  // Store pending approval in memory and wait up to 5 min
  const approvalKey = `outreach_${lead._approvalId}`;
  global.__outreachApprovals = global.__outreachApprovals || {};
  global.__outreachApprovals[approvalKey] = null;

  const decision = await waitForApproval(approvalKey, 300000);
  return decision;
}

function waitForApproval(key, timeoutMs) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const v = global.__outreachApprovals?.[key];
      if (v !== null && v !== undefined) {
        clearInterval(check);
        delete global.__outreachApprovals[key];
        resolve(v);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(check);
        resolve('timeout');
      }
    }, 2000);
  });
}

// Telegram bot wires this via /approve_outreach_ID and /reject_outreach_ID
function handleOutreachApproval(approvalId, decision) {
  global.__outreachApprovals = global.__outreachApprovals || {};
  global.__outreachApprovals[`outreach_${approvalId}`] = decision;
}

// ── Unsubscribe link helpers ──────────────────────────────────────────────────

function unsubscribeUrl(email) {
  const base = process.env.ACC_PUBLIC_URL || 'https://acccommand.center';
  return `${base}/api/outreach/unsubscribe?email=${encodeURIComponent(email)}`;
}

function addUnsubscribeFooter(body, toEmail) {
  return body + `\n\n---\nYou received this because you were identified as a relevant contact. ` +
    `To unsubscribe: ${unsubscribeUrl(toEmail)}`;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function runPipeline(leads, { campaignId, requireApproval = true } = {}) {
  const results = [];
  const campaign = campaignId || `campaign_${Date.now()}`;

  for (const lead of leads) {
    const { name, company, domain, role, notes } = lead;
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';

    let emailFound    = false;
    let emailAddress  = null;
    let messageDrafted = false;
    let status        = 'pending';
    let decision      = null;

    try {
      // Dedup check
      if (await isUnsubscribed(lead.email || domain)) {
        results.push({ lead, status: 'unsubscribed', skipped: true });
        continue;
      }

      const emailResult = await hunter.findEmail(domain, firstName, lastName);
      if (emailResult && emailResult.email) {
        emailFound   = true;
        emailAddress = emailResult.email;

        if (await isAlreadySent(emailAddress, campaign)) {
          results.push({ lead, emailAddress, status: 'duplicate', skipped: true });
          continue;
        }

        const prompt = `Write a 3-sentence outreach email to ${name} at ${company} who is a ${role}. We are ACC v2, an AI orchestration platform for founders. Be professional and concise.`;

        const deepseekResponse = await axios.post(
          'https://api.deepseek.com/v1/chat/completions',
          { model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 200 },
          { headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' } }
        );

        const rawBody    = deepseekResponse.data.choices[0].message.content;
        const emailBody  = addUnsubscribeFooter(rawBody, emailAddress);
        const subject    = `Introduction: ACC v2 & ${name}`;
        messageDrafted   = true;

        // Telegram approval
        lead._approvalId = Date.now().toString(36);
        if (requireApproval && (process.env.TELEGRAM_BOT_TOKEN || process.env.OUTREACH_REQUIRE_APPROVAL === '1')) {
          lead.email = emailAddress;
          decision = await requestTelegramApproval(lead, subject, emailBody);
          if (decision === 'rejected' || decision === 'timeout') {
            status = decision === 'rejected' ? 'rejected' : 'timeout';
            results.push({ lead, emailFound, emailAddress, messageDrafted, status, decision });
            continue;
          }
        }

        await resend.sendTaskFromACC(emailAddress, subject, emailBody);
        await recordSent({ to_address: emailAddress, subject, campaign_id: campaign });
        status = 'sent';
      } else {
        status = 'email_not_found';
      }
    } catch (err) {
      status = 'error';
      log('[outreach] Error processing lead', name, ':', err.message);
    }

    results.push({ lead, emailFound, emailAddress, messageDrafted, status, decision });
  }

  const outputDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'outreach-results.json'),
    JSON.stringify(results, null, 2)
  );

  return results;
}

async function runSingleLead(lead) {
  return runPipeline([lead]);
}

module.exports = { runPipeline, runSingleLead, markUnsubscribed, handleOutreachApproval };
