// cloud/graphs/graphBuilderV2.js
// Canonical location. cloud/telegram/graphBuilderV2.js re-exports from here.
const { classifyIntent }           = require("../orchestrator/intentClassifier.js");
const { pickConnectorsForIntent }  = require("../orchestrator/connectorRouter.js");
const { pickAgentsForIntent }      = require("../orchestrator/agentRouter.js");
const { buildJobSearchGraph }      = require("./graphBuilder_jobs.js");
const { buildTailoredResumeGraph } = require("./graphBuilder_resume.js");
const { buildAutoApplyGraph }      = require("./graphBuilder_apply.js");
const { memoryEngine }             = require("../memory/memoryEngine.js");

function pickSocialClawAction(text) {
  const lower = String(text || "").toLowerCase();
  if (/\bpreview\b|\bdraft\b/.test(lower)) return "preview";
  if (/\bvalidate\b/.test(lower)) return "validate";
  if (/\bdelete\b/.test(lower) && /\bpost\b/.test(lower)) return "posts:delete";
  if (/\bstatus\b|\bhealth\b/.test(lower)) return "health";
  if (/\baccounts?\s+list|\blist\s+accounts\b/.test(lower)) return "accounts:list";
  if (/\bcapabilit/.test(lower) && /\baccounts?\b/.test(lower)) return "accounts:capabilities";
  if (/\busage\b/.test(lower)) return "usage";
  return "apply";
}

async function buildGraphFromUserRequestV2({ text, language = "en", userId, role }) {
  const intentInfo = await classifyIntent(text);
  const intent     = intentInfo.intent;

  // Memory can bias routing
  const userPrefs  = memoryEngine.getLTMFact("userPreferences") || {};

  // Specialized workflows
  if (intent === "job_search")    return await buildJobSearchGraph({ text, language, userId, role });
  if (intent === "tailor_resume") return await buildTailoredResumeGraph({ text, language, userId, role });
  if (intent === "apply_job")     return await buildAutoApplyGraph({ text, language, userId, role });

  const connectors = intentInfo.connectors.length
    ? intentInfo.connectors
    : pickConnectorsForIntent(intent);

  const agents = intentInfo.agents.length
    ? intentInfo.agents
    : pickAgentsForIntent(intent);

  const nodes = [];

  nodes.push({
    id: "PLAN", agentType: "architect",
    payload: { prompt: `User: ${text}\nIntent: ${intent}\nPlan the steps.`, language },
    dependsOn: [], meta: { userId, role },
  });

  if (connectors.includes("notion")) {
    nodes.push({
      id: "N1", agentType: "notion",
      payload: { action: "createPage", data: { parent: { database_id: process.env.DEFAULT_DB_ID || "REPLACE_DB_ID" }, properties: { Name: { title: [{ text: { content: text.slice(0, 50) } }] } } } },
      dependsOn: ["PLAN"], meta: { userId, role },
    });
  }

  if (connectors.includes("clickup")) {
    nodes.push({
      id: "C1", agentType: "clickup",
      payload: { action: "createTask", listId: process.env.CLICKUP_JOB_LIST_ID || "REPLACE_CLICKUP_JOB_LIST", data: { name: text.slice(0, 80), description: `Generated from ACC.\nIntent: ${intent}` } },
      dependsOn: ["PLAN"], meta: { userId, role },
    });
  }

  if (connectors.includes("socialclaw")) {
    const socialAction = pickSocialClawAction(text);
    const publishSummary = `Create a social-ready draft for: ${text.slice(0, 120)}`;
    nodes.push({
      id: "A1",
      agentType: "alphonso",
      payload: {
        mode: "generate",
        prompt: publishSummary,
        format: "social_post",
        language,
        userId,
        role,
      },
      dependsOn: ["PLAN"],
      meta: {
        userId,
        role,
        workflow_stage: "generate",
        workflow_pipeline: "alphonso_to_socialclaw",
      },
    });
    nodes.push({
      id: "S1",
      agentType: "socialclaw",
      payload: {
        action: socialAction,
        schedule: {
          title: text.slice(0, 80),
          prompt: publishSummary,
          language,
          userId,
          role,
        },
      },
      dependsOn: ["A1"],
      meta: {
        userId,
        role,
        requiresApproval: true,
        allowedRoles: ["Admin", "Operator"],
        workflow_stage: "publish",
        workflow_pipeline: "alphonso_to_socialclaw",
      },
    });
  }

  if (agents.includes("browser")) {
    nodes.push({
      id: "B1", agentType: "browser",
      payload: { mode: "search", query: text, language },
      dependsOn: ["PLAN"], meta: { userId, role },
    });
  }

  if (agents.includes("deepseek") || nodes.length > 1) {
    const priorIds = nodes.map(n => n.id);
    nodes.push({
      id: "VAL", agentType: "deepseek",
      payload: { mode: "validate", prompt: `Validate the overall plan and outputs for: "${text}"`, language },
      dependsOn: priorIds, meta: { userId, role },
    });
  }

  return nodes;
}

module.exports = { buildGraphFromUserRequestV2 };
