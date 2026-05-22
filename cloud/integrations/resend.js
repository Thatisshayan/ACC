'use strict';
// cloud/integrations/resend.js
// Resend — transactional email sending
// ALL emails require Telegram approval before sending

var axios   = require('axios');
var fs      = require('fs');
var path    = require('path');
var KEY     = process.env.RESEND_API_KEY || '';
var FROM    = process.env.RESEND_FROM_EMAIL || 'ACC v2 <noreply@acc.app>';
var BASE    = 'https://api.resend.com';
var TMPL_DIR = path.join(__dirname, '../../data/email-templates');

if (!KEY) console.warn('[resend] RESEND_API_KEY not set. Get at: resend.com/api-keys');

function enabled() { return !!KEY; }

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'Set RESEND_API_KEY at resend.com/api-keys' };
  try {
    var r = await axios.get(BASE + '/domains', { headers: { Authorization: 'Bearer ' + KEY }, timeout: 8000 });
    return { status: 'connected', domains: (r.data.data||[]).length };
  } catch(e) { return { status: 'error', error: e.response ? e.response.status : e.message }; }
}

async function sendEmail(to, subject, html, from) {
  if (!enabled()) return { success: false, error: 'RESEND_API_KEY not set' };
  try {
    var r = await axios.post(BASE + '/emails', { from: from || FROM, to: Array.isArray(to) ? to : [to], subject, html }, { headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    return { success: true, id: r.data.id, to: to };
  } catch(e) { return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message }; }
}

async function sendPlainText(to, subject, text) {
  return sendEmail(to, subject, '<pre>' + text + '</pre>');
}

function parseEmailTask(instruction) {
  var toMatch      = instruction.match(/to\s+([\w.@+-]+@[\w.+-]+)/i);
  var subjectMatch = instruction.match(/subject[:\s]+(.+?)(?:\s+body|\s+saying|\s+about|$)/i);
  var bodyMatch    = instruction.match(/(?:body|saying|about)[:\s]+(.+)$/i);
  if (!toMatch) return null;

  var to = toMatch[1];
  var subject = subjectMatch ? subjectMatch[1].trim() : 'Message from ACC';
  var body = bodyMatch ? bodyMatch[1].trim() : instruction;

  return { to: to, subject: subject, body: body };
}

function loadTemplate(name) {
  try {
    return fs.readFileSync(path.join(TMPL_DIR, name + '.html'), 'utf8');
  } catch(e) { return null; }
}

function fillTemplate(html, vars) {
  return html.replace(/\{(\w+)\}/g, function(m, k) { return vars[k] || m; });
}

async function sendWithTemplate(to, templateName, variables) {
  var tmpl = loadTemplate(templateName);
  if (!tmpl) return { success: false, error: 'Template not found: ' + templateName + '. Available: job_application, follow_up, cover_letter' };
  var html = fillTemplate(tmpl, variables || {});
  return sendEmail(to, variables.subject || 'Message from ACC', html);
}

async function sendTaskFromACC(accTask, options) {
  if (!enabled()) return { success: false, error: 'RESEND_API_KEY not set. Get at resend.com/api-keys' };
  var instruction = accTask.instruction || accTask.title || '';
  var details = parseEmailTask(instruction);
  if (!details) {
    return { success: false, provider: 'resend', error: 'Could not find recipient. Use: "send email to john@company.com subject: Hello body: message"', summary: 'Email parse failed' };
  }

  if (options && options.approved === true) {
    var html = '<pre style="font-family:inherit;white-space:pre-wrap">' + escapeHtml(details.body) + '</pre>';
    var sent = await sendEmail(details.to, details.subject, html);
    if (!sent.success) {
      return { success: false, provider: 'resend', error: sent.error, summary: 'Email send failed', output: sent.error };
    }
    return {
      success: true,
      provider: 'resend',
      to: details.to,
      subject: details.subject,
      output: 'Email sent to ' + details.to + '\nSubject: ' + details.subject + '\nFrom: ' + FROM,
      summary: 'Email sent to ' + details.to,
    };
  }

  return {
    success: false,
    requires_approval: true,
    action: 'high_risk_execution',
    provider: 'resend',
    preview: { to: details.to, subject: details.subject, body: details.body.slice(0, 200) },
    error: 'Email requires approval. Check /approvals to send to: ' + details.to,
    output: 'EMAIL PENDING APPROVAL\nTo: ' + details.to + '\nSubject: ' + details.subject + '\nPreview: ' + details.body.slice(0, 100) + '...\n\nApprove in Telegram: /approvals',
    summary: 'Email awaiting approval for ' + details.to,
  };
}

module.exports = { enabled, checkHealth, sendEmail, sendPlainText, sendWithTemplate, sendTaskFromACC, parseEmailTask };
