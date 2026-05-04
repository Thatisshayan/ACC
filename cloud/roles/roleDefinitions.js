// cloud/roles/roleDefinitions.js
// Canonical role definitions, permissions, and guardrails for ACC.

const ROLES = {
  Admin: {
    description:    "Full system control and configuration.",
    riskLevel:      "high",
    canModifyConfig: true,
    canApproveAll:  true,
    permissions: [
      "execute_any_node",
      "enable_disable_connectors",
      "change_policies",
      "approve_high_risk_actions",
      "provision_connector_keys",
      "export_evidence",
      "deploy_pages",
    ],
    guardrails: [],
  },

  Operator: {
    description:    "Run and monitor workflows; approve auto-expansions.",
    riskLevel:      "medium",
    canModifyConfig: false,
    canApproveAll:  false,
    permissions: [
      "start_stop_graphs",
      "approve_marketplace_posts",
      "approve_outreach_batches",
      "approve_graph_expansions",
      "confirm_first_booking",
      "view_logs",
      "view_snapshots",
    ],
    guardrails: [
      "Must approve first N automated marketplace posts or outreach messages per campaign.",
    ],
  },

  Agent: {
    description:    "Autonomous worker with constrained privileges.",
    riskLevel:      "medium",
    canModifyConfig: false,
    canApproveAll:  false,
    permissions: [
      "execute_graph_nodes",
      "call_connectors_with_scoped_tokens",
      "negotiate_within_policy",
    ],
    guardrails: [
      "Negotiation caps enforced (min price, max counter).",
      "Daily message quotas enforced.",
      "Cannot use credentials requiring Admin provisioning.",
    ],
  },

  LegalAssistant: {
    description:    "Evidence intake and packaging.",
    riskLevel:      "high",
    canModifyConfig: false,
    canApproveAll:  false,
    permissions: [
      "ingest_evidence",
      "run_ocr_redaction",
      "create_export_packages",
      "organize_notion_drive",
      "tag_classify_files",
    ],
    guardrails: [
      "Cannot produce legal advice text.",
      "Must attach disclaimer to all exports.",
      "Encryption required for all evidence.",
      "External export requires Admin approval.",
    ],
  },

  Marketing: {
    description:    "Content and outreach automation.",
    riskLevel:      "medium",
    canModifyConfig: false,
    canApproveAll:  false,
    permissions: [
      "run_content_pipelines",
      "generate_tts",
      "build_videos",
      "upload_to_channels",
      "create_landing_pages",
      "run_seo_jobs",
      "initiate_opt_in_campaigns",
    ],
    guardrails: [
      "Only upload to channels with valid API keys.",
      "SEO auto-tags must be reviewed for brand safety.",
      "First outreach batch requires Operator approval.",
    ],
  },

  SalesBot: {
    description:    "Marketplace and outreach automation.",
    riskLevel:      "high",
    canModifyConfig: false,
    canApproveAll:  false,
    permissions: [
      "post_listings",
      "message_leads",
      "schedule_appointments",
      "create_calendar_events",
      "propose_meeting_times",
      "negotiate_within_policy",
    ],
    guardrails: [
      "Must obey platform rate limits.",
      "Operator approval required for first contact per new buyer.",
      "All messages logged to LTM and ClickUp.",
      "Negotiation bounded by policy thresholds.",
    ],
  },

  Viewer: {
    description:    "Read-only monitoring.",
    riskLevel:      "low",
    canModifyConfig: false,
    canApproveAll:  false,
    permissions: [
      "view_logs",
      "view_snapshots",
      "view_memory",
      "view_connector_status",
    ],
    guardrails: [
      "No write operations permitted.",
    ],
  },
};

/**
 * getRoleDefinition
 * @param {string} role
 * @returns {Object|null}
 */
function getRoleDefinition(role) {
  return ROLES[role] || null;
}

/**
 * hasPermission
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  const def = ROLES[role];
  if (!def) return false;
  if (def.permissions.includes("execute_any_node")) return true; // Admin
  return def.permissions.includes(permission);
}

/**
 * canExecuteNode
 * Checks if a role is in a node's allowedRoles list.
 * If allowedRoles is empty/missing, any role can execute.
 * @param {string}   role
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
function canExecuteNode(role, allowedRoles = []) {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return allowedRoles.includes(role);
}

module.exports = { ROLES, getRoleDefinition, hasPermission, canExecuteNode };
