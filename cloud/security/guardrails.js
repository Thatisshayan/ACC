'use strict';
// cloud/security/guardrails.js
// ACC v2 — Universal AI Agent Guardrail Policy
// ALL agents must respect these rules. No exceptions.

var fs   = require('fs');
var path = require('path');

var AUDIT_FILE = path.join(__dirname, '../../data/guardrail-audit.json');

// ── What NO agent can ever do ─────────────────────────────────────────────────
var FORBIDDEN_ACTIONS = [
  'delete_production_data',
  'push_to_main_without_review',
  'execute_payment_transaction',
  'expose_api_key_or_secret',
  'send_message_to_real_users_without_approval',
  'deploy_to_production_without_approval',
  'access_files_outside_allowed_directories',
  'modify_vault_or_security_files_without_approval',
  'disable_safety_checks_or_approval_gates',
  'create_admin_accounts',
  'bulk_delete_users_or_data',
  'modify_rate_limiting_config_in_production',
  'bypass_hmac_verification',
  'commit_secrets_or_env_files_to_git',
];

// ── What each agent CAN do without approval ───────────────────────────────────
var AGENT_PERMISSIONS = {
  claude:     ['read_files', 'write_specs', 'review_code', 'generate_content', 'analyze', 'plan'],
  openhands:  ['read_files', 'write_code', 'create_pr', 'run_tests', 'commit_feature_branch'],
  aider:      ['read_files', 'write_code', 'commit_feature_branch', 'run_syntax_check'],
  devika:     ['read_files', 'write_code', 'local_execution', 'run_tests'],
  alphonso:   ['local_ollama_query', 'read_local_files', 'generate_content'],
  crewai:     ['read_files', 'web_research', 'write_content', 'analyze'],
  cursor:     ['read_files', 'write_code_in_repo', 'run_local_commands'],
  codex:      ['read_files', 'write_code', 'run_tests'],
  gemini:     ['design_specs', 'ui_mockups', 'generate_content'],
  chatgpt:    ['strategy', 'planning', 'review', 'content'],
};

// ── What requires Shayan's explicit Telegram approval ────────────────────────
var REQUIRES_APPROVAL = [
  'deploy_to_production',
  'merge_pr_to_main',
  'send_message_to_real_users',
  'post_publicly',
  'change_security_configuration',
  'add_or_remove_users',
  'financial_transaction',
  'permanently_delete_data',
  'enable_canary_mode',
  'change_rate_limits',
  'rotate_api_keys',
];

// ── GuardrailError ────────────────────────────────────────────────────────────
function GuardrailError(message, agentName, action) {
  this.message = message;
  this.name    = 'GuardrailError';
  this.agent   = agentName;
  this.action  = action;
  this.stack   = new Error(message).stack;
}
GuardrailError.prototype = Object.create(Error.prototype);

// ── Core check ────────────────────────────────────────────────────────────────
function checkAgentAction(agentName, action, context) {
  var agent = (agentName || '').toLowerCase();

  // 1. Forbidden check
  if (FORBIDDEN_ACTIONS.indexOf(action) !== -1) {
    return { allowed: false, requiresApproval: false, reason: 'FORBIDDEN: ' + action + ' is never allowed for any agent.' };
  }

  // 2. Approval required check
  if (REQUIRES_APPROVAL.indexOf(action) !== -1) {
    return { allowed: false, requiresApproval: true, reason: 'APPROVAL_REQUIRED: ' + action + ' needs explicit Shayan approval via Telegram.' };
  }

  // 3. Permission check
  var perms = AGENT_PERMISSIONS[agent];
  if (!perms) {
    return { allowed: false, requiresApproval: false, reason: 'UNKNOWN_AGENT: ' + agentName + ' is not registered in guardrails.' };
  }
  if (perms.indexOf(action) !== -1 || perms.indexOf('*') !== -1) {
    return { allowed: true, requiresApproval: false, reason: 'PERMITTED: ' + agentName + ' is allowed to ' + action };
  }

  // 4. Default deny for unregistered actions
  return { allowed: false, requiresApproval: true, reason: 'UNREGISTERED_ACTION: ' + action + ' not in ' + agentName + ' permissions. Requires approval.' };
}

function logGuardrailCheck(agentName, action, result) {
  try {
    var entry = { ts: new Date().toISOString(), agent: agentName, action: action, allowed: result.allowed, requiresApproval: result.requiresApproval, reason: result.reason };
    var log = [];
    try { log = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')); } catch(e) {}
    log.push(entry);
    if (log.length > 1000) log = log.slice(-500); // keep last 500
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(log, null, 2));
  } catch(e) { /* never crash on audit failure */ }
}

function enforceGuardrail(agentName, action, context) {
  var result = checkAgentAction(agentName, action, context);
  logGuardrailCheck(agentName, action, result);

  if (!result.allowed && !result.requiresApproval) {
    throw new GuardrailError('[GUARDRAIL BLOCKED] ' + result.reason, agentName, action);
  }
  if (!result.allowed && result.requiresApproval) {
    throw new GuardrailError('[GUARDRAIL APPROVAL] ' + result.reason + ' Send /approvals to review.', agentName, action);
  }
  return true;
}

module.exports = { checkAgentAction, enforceGuardrail, logGuardrailCheck, GuardrailError, FORBIDDEN_ACTIONS, AGENT_PERMISSIONS, REQUIRES_APPROVAL };
