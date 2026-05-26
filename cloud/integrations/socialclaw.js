'use strict';
// cloud/integrations/socialclaw.js
// ACC adapter for SocialClaw publishing infrastructure
// Keeps ACC as the brain and SocialClaw as the execution surface.

const { getConnector } = require('../connectors/registry.js');

function getSocialClawConnector() {
  return getConnector('socialclaw');
}

function enabled() {
  return !!getSocialClawConnector();
}

async function checkHealth() {
  const connector = getSocialClawConnector();
  if (!connector) {
    return {
      status: 'setup_required',
      note: 'SocialClaw connector is not loaded. Set SOCIALCLAW_API_KEY and install the socialclaw CLI.',
    };
  }
  return connector.checkHealth();
}

async function listAccounts() {
  const connector = getSocialClawConnector();
  if (!connector) return { success: false, status: 'setup_required', error: 'SocialClaw connector not loaded.' };
  return connector.run('accounts:list', {});
}

async function previewCampaign(payload) {
  const connector = getSocialClawConnector();
  if (!connector) return { success: false, status: 'setup_required', error: 'SocialClaw connector not loaded.' };
  return connector.run('preview', payload || {});
}

async function validateCampaign(payload) {
  const connector = getSocialClawConnector();
  if (!connector) return { success: false, status: 'setup_required', error: 'SocialClaw connector not loaded.' };
  return connector.run('validate', payload || {});
}

async function applyCampaign(payload) {
  const connector = getSocialClawConnector();
  if (!connector) return { success: false, status: 'setup_required', error: 'SocialClaw connector not loaded.' };
  return connector.run('apply', payload || {});
}

async function deletePost(payload) {
  const connector = getSocialClawConnector();
  if (!connector) return { success: false, status: 'setup_required', error: 'SocialClaw connector not loaded.' };
  return connector.run('posts:delete', payload || {});
}

async function getUsage() {
  const connector = getSocialClawConnector();
  if (!connector) return { success: false, status: 'setup_required', error: 'SocialClaw connector not loaded.' };
  return connector.run('usage', {});
}

function inferAction(instruction) {
  const text = String(instruction || '').toLowerCase();
  if (/accounts?\s+list|list\s+accounts/.test(text)) return 'accounts:list';
  if (/capabilit/.test(text) && /accounts?/.test(text)) return 'accounts:capabilities';
  if (/\bvalidate\b/.test(text)) return 'validate';
  if (/\bpreview\b|\bdraft\b/.test(text)) return 'preview';
  if (/\bapply\b|\bpublish\b|\bschedule\b/.test(text)) return 'apply';
  if (/\bdelete\b/.test(text) && /\bpost\b/.test(text)) return 'posts:delete';
  if (/\busage\b/.test(text)) return 'usage';
  if (/\bhealth\b|\bstatus\b/.test(text)) return 'health';
  return 'apply';
}

async function sendTaskFromACC(accTask) {
  const connector = getSocialClawConnector();
  if (!connector) {
    return {
      success: false,
      status: 'setup_required',
      error: 'SocialClaw connector not loaded. Set SOCIALCLAW_API_KEY and install the socialclaw CLI.',
    };
  }

  const instruction = String((accTask && (accTask.instruction || accTask.title)) || '').trim();
  const payload = Object.assign({}, (accTask && accTask.payload) || {});
  const action = payload.action || inferAction(instruction);

  if (action === 'accounts:list') return connector.run('accounts:list', payload);
  if (action === 'accounts:capabilities') return connector.run('accounts:capabilities', payload);
  if (action === 'preview') return connector.run('preview', payload);
  if (action === 'validate') return connector.run('validate', payload);
  if (action === 'posts:delete') return connector.run('posts:delete', payload);
  if (action === 'usage') return connector.run('usage', payload);
  if (action === 'health') return connector.run('health', payload);
  return connector.run('apply', payload);
}

module.exports = {
  enabled,
  checkHealth,
  listAccounts,
  previewCampaign,
  validateCampaign,
  applyCampaign,
  deletePost,
  getUsage,
  inferAction,
  sendTaskFromACC,
};
