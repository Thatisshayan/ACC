// cloud/graphs/graphBuilderV2.js
// Canonical location. cloud/telegram/graphBuilderV2.js re-exports from here.
const { classifyIntent }           = require("../orchestrator/intentClassifier.js");
const { pickConnectorsForIntent }  = require("../orchestrator/connectorRouter.js");
const { pickAgentsForIntent }      = require("../orchestrator/agentRouter.js");
const { buildJobSearchGraph }      = require("./graphBuilder_jobs.js");
const { buildTailoredResumeGraph } = require("./graphBuilder_resume.js");
const { buildAutoApplyGraph }      = require("./graphBuilder_apply.js");
const { memoryEngine }             = require("../memory/memoryEngine.js");

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
