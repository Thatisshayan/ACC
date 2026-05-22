'use strict';

const axios = require('axios');
const uuid = require('uuid').v4;
const store = require('../taskbus/store.js');
const airtable = require('../connectors/airtable.js');
const clickup = require('../connectors/clickup.js');

const LEADS_TABLE = process.env.AIRTABLE_LEADS_TABLE || 'Leads';
const CLICKUP_LEADS_LIST_ID = process.env.CLICKUP_LEADS_LIST_ID || '';
const DEFAULT_SHEET_CSV_URL = process.env.GOOGLE_SHEETS_LEADS_CSV_URL || '';

function classifyFailure(err) {
  const msg = (err && err.message) ? err.message.toLowerCase() : '';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) return 'auth';
  if (msg.includes('not configured') || msg.includes('missing')) return 'misconfig';
  if (msg.includes('invalid') || msg.includes('parse')) return 'validation';
  return 'unknown';
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
  return lines.slice(1).map(function(line) {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach(function(h, idx) { row[h] = (values[idx] || '').trim(); });
    return row;
  });
}

function normalizeLead(raw, idx) {
  const name = raw.name || raw.contact_name || raw.full_name || '';
  const email = raw.email || raw.contact_email || '';
  const company = raw.company || raw.business || raw.organization || '';
  const phone = raw.phone || raw.phone_number || '';
  const website = raw.website || raw.domain || '';
  const notes = raw.notes || raw.note || '';
  return {
    idx: idx + 1,
    name: name,
    email: email,
    company: company,
    phone: phone,
    website: website,
    notes: notes
  };
}

function validLead(lead) {
  return !!(lead && (lead.email || lead.company || lead.website));
}

async function fetchLeadsFromSheet(sheetCsvUrl) {
  if (!sheetCsvUrl) {
    throw new Error('GOOGLE_SHEETS_LEADS_CSV_URL not configured and no sheetCsvUrl provided');
  }
  const resp = await axios.get(sheetCsvUrl, { timeout: 20000 });
  const rows = parseCsv(resp.data || '');
  return rows.map(normalizeLead).filter(validLead);
}

function buildTaskFromLead(lead, requestId, createdBy) {
  const leadLabel = lead.company || lead.email || ('lead-' + lead.idx);
  const instruction = [
    'Outreach/CRM lead processing task.',
    'Lead source: Google Sheets.',
    'Lead:',
    '- Name: ' + (lead.name || ''),
    '- Email: ' + (lead.email || ''),
    '- Company: ' + (lead.company || ''),
    '- Phone: ' + (lead.phone || ''),
    '- Website: ' + (lead.website || ''),
    '- Notes: ' + (lead.notes || ''),
    '',
    'Required policy:',
    '- Any outbound messaging requires approval.',
    '- CRM write operations are allowed after approval.',
    '',
    'Execution goal:',
    '- Prepare personalized outreach draft and CRM stage recommendation.',
    '- Return receipt with exact actions and evidence.'
  ].join('\n');

  return store.createTask({
    title: '[Outreach/CRM] ' + leadLabel,
    instruction: instruction,
    assigned_agent: 'claude',
    priority: 'high',
    required_output: 'Personalized outreach draft + CRM action plan + evidence receipt',
    approval_required: true,
    automation_mode: 'semi_auto',
    feature_ref: '#Aegis-Outreach-CRM',
    created_by: createdBy || 'chatgpt',
    request_id: requestId,
    meta: {
      workflow: 'acc_outreach_crm',
      source: 'google_sheets',
      lead: lead
    }
  });
}

async function mirrorLeadToAirtable(lead) {
  if (!airtable.enabled()) return { status: 'skipped', reason: 'airtable_disabled' };
  const rec = await airtable.createRecord(LEADS_TABLE, {
    Name: lead.name || '',
    Email: lead.email || '',
    Company: lead.company || '',
    Phone: lead.phone || '',
    Website: lead.website || '',
    Notes: lead.notes || '',
    Source: 'google_sheets',
    ImportedAt: new Date().toISOString()
  });
  if (!rec.success) return { status: 'failed', reason: rec.error || 'airtable_write_failed' };
  return { status: 'ok', record_id: rec.id };
}

async function mirrorLeadToClickUp(lead, listIdOverride) {
  const listId = listIdOverride || CLICKUP_LEADS_LIST_ID;
  if (!clickup.enabled() || !listId) return { status: 'skipped', reason: 'clickup_disabled_or_missing_list' };
  const res = await clickup.createTask(listId, {
    name: '[Lead] ' + (lead.company || lead.email || lead.name || 'unknown'),
    description: [
      'Name: ' + (lead.name || ''),
      'Email: ' + (lead.email || ''),
      'Company: ' + (lead.company || ''),
      'Phone: ' + (lead.phone || ''),
      'Website: ' + (lead.website || ''),
      'Notes: ' + (lead.notes || ''),
      'Source: Google Sheets'
    ].join('\n'),
    priority: 3,
    tags: ['acc', 'lead-intake', 'outreach-crm']
  });
  if (!res.success) return { status: 'failed', reason: res.error || 'clickup_write_failed' };
  return { status: 'ok', task_id: res.task && res.task.id };
}

async function bootstrapOutreachCrm(params) {
  const requestId = (params && params.requestId) || uuid();
  const sink = (params && params.sink) || 'none'; // none | airtable | clickup | both
  const maxLeads = Math.max(1, Math.min(Number((params && params.maxLeads) || 25), 500));
  const createdBy = (params && params.createdBy) || 'chatgpt';
  const sheetCsvUrl = (params && params.sheetCsvUrl) || DEFAULT_SHEET_CSV_URL;

  const receipt = {
    workflow: 'acc_outreach_crm',
    request_id: requestId,
    sink: sink,
    max_leads: maxLeads,
    started_at: new Date().toISOString(),
    leads_loaded: 0,
    tasks_created: 0,
    mirrored: { airtable_ok: 0, airtable_failed: 0, clickup_ok: 0, clickup_failed: 0 },
    failures: []
  };

  try {
    const leads = await fetchLeadsFromSheet(sheetCsvUrl);
    const limited = leads.slice(0, maxLeads);
    receipt.leads_loaded = limited.length;

    const taskIds = [];
    for (let i = 0; i < limited.length; i += 1) {
      const lead = limited[i];
      const task = buildTaskFromLead(lead, requestId, createdBy);
      taskIds.push(task.id);
      receipt.tasks_created += 1;

      if (sink === 'airtable' || sink === 'both') {
        const a = await mirrorLeadToAirtable(lead);
        if (a.status === 'ok') receipt.mirrored.airtable_ok += 1;
        else if (a.status === 'failed') {
          receipt.mirrored.airtable_failed += 1;
          receipt.failures.push({ type: 'airtable', lead: lead.email || lead.company || lead.idx, reason: a.reason });
        }
      }
      if (sink === 'clickup' || sink === 'both') {
        const c = await mirrorLeadToClickUp(lead, clickupListId);
        if (c.status === 'ok') receipt.mirrored.clickup_ok += 1;
        else if (c.status === 'failed') {
          receipt.mirrored.clickup_failed += 1;
          receipt.failures.push({ type: 'clickup', lead: lead.email || lead.company || lead.idx, reason: c.reason });
        }
      }
    }

    receipt.completed_at = new Date().toISOString();

    const result = store.addResult({
      task_id: taskIds[0] || null,
      agent: 'claude',
      provider_used: 'manual',
      cost_tier: 'manual',
      is_real_ai_result: false,
      provider_chain_attempted: ['manual'],
      summary: 'Outreach/CRM bootstrap created ' + receipt.tasks_created + ' approval-gated tasks.',
      output: JSON.stringify(receipt, null, 2),
      request_id: requestId,
      receipt: receipt,
      failure_class: receipt.failures.length ? 'partial_failure' : null
    });

    return { success: true, request_id: requestId, task_ids: taskIds, receipt: receipt, result_id: result.id };
  } catch (err) {
    const failureClass = classifyFailure(err);
    return {
      success: false,
      request_id: requestId,
      error: err.message,
      failure_class: failureClass,
      receipt: Object.assign(receipt, { failed_at: new Date().toISOString(), failure_class: failureClass })
    };
  }
}

function health() {
  return {
    workflow: 'acc_outreach_crm',
    google_sheets_csv_configured: !!DEFAULT_SHEET_CSV_URL,
    airtable_enabled: !!airtable.enabled(),
    clickup_enabled: !!clickup.enabled(),
    clickup_leads_list_configured: !!CLICKUP_LEADS_LIST_ID
  };
}

module.exports = {
  bootstrapOutreachCrm,
  health
};
