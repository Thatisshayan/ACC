// cloud/telegram/graphBuilderV2.js
const { classifyIntent }           = require("../orchestrator/intentClassifier.js");
const { pickConnectorsForIntent }  = require("../orchestrator/connectorRouter.js");
const { pickAgentsForIntent }      = require("../orchestrator/agentRouter.js");
const { buildJobSearchGraph }      = require("./graphBuilder_jobs.js");
const { buildTailoredResumeGraph } = require("./graphBuilder_resume.js");
const { buildAutoApplyGraph }      = require("./graphBuilder_apply.js");

/**
 * buildGraphFromUserRequestV2
 * Intent-aware graph builder.
 * Uses DeepSeek to classify intent, then builds a tailored TaskNode[] graph.
 *
 * @param {Object} params
 * @param {string} params.text     - user's raw request
 * @param {string} params.language - "en" | "fa"
 * @param {string} params.userId
 * @param {string} params.role     - user role for priority
 * @returns {Promise<Array>} TaskNode[]
 */
async function buildGraphFromUserRequestV2({ text, language, userId, role }) {
  // Classify intent (falls back gracefully if DeepSeek key missing)
  const intentInfo = await classifyIntent(text);
  const intent     = intentInfo.intent;

  // ── Specialized workflow routing ────────────────────────────────────────────
  if (intent === "job_search") {
    return await buildJobSearchGraph({ text, language, userId, role });
  }

  if (intent === "tailor_resume") {
    return await buildTailoredResumeGraph({ text, language, userId, role });
  }

  if (intent === "apply_job") {
    return await buildAutoApplyGraph({ text, language, userId, role });
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Use DeepSeek's connector/agent picks, or fall back to skill-map routing
  const connectors = intentInfo.connectors.length
    ? intentInfo.connectors
    : pickConnectorsForIntent(intent);

  const agents = intentInfo.agents.length
    ? intentInfo.agents
    : pickAgentsForIntent(intent);

  const nodes = [];

  // ── 1) Planning node (Claude) ──────────────────────────────────────────────
  nodes.push({
    id:        "PLAN",
    agentType: "architect",
    payload: {
      prompt: `User request: ${text}\nDetected intent: ${intent}\nPlan the execution steps clearly.`,
      language,
    },
    dependsOn: [],
    meta: { userId, role },
  });

  // ── 2) Connector nodes ──────────────────────────────────────────────────────

  if (connectors.includes("notion")) {
    nodes.push({
      id:        "N1",
      agentType: "notion",
      payload: {
        action: "createPage",
        data: {
          parent:     { database_id: process.env.NOTION_DB_ID || "REPLACE_DB_ID" },
          properties: { Name: { title: [{ text: { content: text.slice(0, 50) } }] } },
        },
      },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    });
  }

  if (connectors.includes("clickup")) {
    nodes.push({
      id:        "C1",
      agentType: "clickup",
      payload: {
        action: "createTask",
        listId: process.env.CLICKUP_LIST_ID || "REPLACE_LIST_ID",
        data: {
          name:        text.slice(0, 80),
          description: `Generated from ACC request.\nIntent: ${intent}`,
        },
      },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    });
  }

  // ── 3) Research/browse node ─────────────────────────────────────────────────
  if (agents.includes("browser")) {
    nodes.push({
      id:        "B1",
      agentType: "browser",
      payload:   { mode: "search", query: text, language },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    });
  }

  // ── 4) Job search nodes ─────────────────────────────────────────────────────
  if (connectors.includes("linkedin") || intent === "job_search") {
    nodes.push({
      id:        "LI1",
      agentType: "linkedin",
      payload:   { action: "searchJobs", data: { query: text } },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    });
  }

  if (connectors.includes("indeed") || intent === "job_search") {
    nodes.push({
      id:        "IN1",
      agentType: "indeed",
      payload:   { action: "searchJobs", data: { query: text } },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    });
  }

  // ── 5) Validation node (DeepSeek) ───────────────────────────────────────────
  if (agents.includes("deepseek") || nodes.length > 1) {
    const priorIds = nodes.map(n => n.id);
    nodes.push({
      id:        "VAL",
      agentType: "deepseek",
      payload: {
        mode:   "validate",
        prompt: `Validate the overall plan and outputs for: "${text}"\nIntent: ${intent}`,
        language,
      },
      dependsOn: priorIds,
      meta: { userId, role },
    });
  }

  return nodes;
}

module.exports = { buildGraphFromUserRequestV2 };
