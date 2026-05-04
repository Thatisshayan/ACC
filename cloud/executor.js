// cloud/executor.js
const { runClaudeTask }      = require("./connectors/claude.js");
const { runOpenAITask }      = require("./connectors/openai.js");
const { runLocalLLMTask }    = require("./connectors/local.js");
const { runBrowserTask }     = require("./connectors/browser.js");
const { runRunwayTask }      = require("./connectors/runway.js");
const { runPikaTask }        = require("./connectors/pika.js");
const { runLumaTask }        = require("./connectors/luma.js");
const { runSoraTask }        = require("./connectors/sora.js");
const { runElevenLabsTask }  = require("./connectors/elevenlabs.js");
const { runDalleTask }       = require("./connectors/dalle.js");
const { runMidjourneyTask }  = require("./connectors/midjourney.js");
const { runDeepseekTask }    = require("./connectors/deepseek.js");
const { uploadToR2 }         = require("./storage/r2.js");
const { saveMediaRecord }    = require("./storage/supabase.js");
const { getConnector }           = require("./connectors/registry.js");
const { mergeConnectorResults }  = require("./orchestrator/mergeEngine.js");
const { getNodeOutputs }         = require("./orchestrator/snapshots.js");
// Role + approval + audit
const { isRoleAllowed }          = require("./utils/rolePolicy.js");
const { queueForApproval }       = require("./utils/approvalQueue.js");
const { logNodeRun }             = require("./utils/auditLog.js");
// Marketplace + deploy
const { getMarketplaceAdapter }  = require("./connectors/marketplace/registry.js");
const { NetlifyConnector }       = require("./connectors/deploy/netlify.js");
// Rate limiter + vault (wired as of this patch)
const { allowRequest, initBucket } = require("./security/rateLimiter.js");
const { readSecret }               = require("./security/vaultStub.js");

const netlify = new NetlifyConnector();

// ── Initialize rate limit buckets ─────────────────────────────────────────────
initBucket("kijiji",   30, 1);
initBucket("notion",   20, 1);
initBucket("clickup",  20, 1);
initBucket("netlify",  10, 1);
initBucket("browser",  60, 2);
initBucket("deepseek", 50, 1);
initBucket("claude",   40, 1);
initBucket("openai",   40, 1);

function defaultEngineForAgent(agentType) {
  if (["architect", "writer", "research"].includes(agentType)) return "claude";
  if (["engineer", "data"].includes(agentType)) return "openai";
  return "openai";
}

async function executeTask(task = {}) {
  const { agentType, payload, meta = {} } = task;

  if (!agentType) {
    return { success: false, error: "Executor: missing agentType." };
  }

  // ── Role enforcement ──────────────────────────────────────────────────────
  const requesterRole = meta.role || "Agent";
  const allowedRoles  = meta.allowedRoles || [];
  const needsApproval = meta.requiresApproval || false;
  const snapshotId    = meta.snapshotId || null;

  const roleCheck = isRoleAllowed(requesterRole, allowedRoles);
  if (!roleCheck.allowed) {
    return { success: false, error: `Permission denied: ${roleCheck.reason}` };
  }

  if (needsApproval) {
    const approvalId = queueForApproval(task, snapshotId, requesterRole);
    return { success: false, status: "pendingApproval", approvalId, error: `Node requires Operator approval. ID: ${approvalId}` };
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  if (!allowRequest(agentType)) {
    return { success: false, error: `Rate limit exceeded for "${agentType}". Try again shortly.` };
  }
  // ─────────────────────────────────────────────────────────────────────────

  let result;

  // ---------- MERGE ENGINE ----------
  if (agentType === "merge") {
    const sources   = payload?.sources || [];
    const mergeType = payload?.mergeType || "generic";
    const sid       = task.meta?.snapshotId || null;
    let resultsArray;
    if (sid && sources.length > 0) { resultsArray = getNodeOutputs(sid, sources); }
    else if (Array.isArray(payload?.data)) { resultsArray = payload.data; }
    else { return { success: false, error: "merge: provide payload.sources or payload.data." }; }
    result = await mergeConnectorResults(resultsArray, mergeType);
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: result.success ? "completed" : "failed" });
    return result;
  }

  // ---------- DEEPSEEK ----------
  if (agentType === "deepseek") {
    result = await runDeepseekTask(payload);
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: result.success ? "completed" : "failed" });
    return result;
  }

  // ---------- NETLIFY ----------
  if (agentType === "netlify") {
    // Vault-aware API key injection
    if (!netlify.apiKey) {
      netlify.apiKey = readSecret("NETLIFY_API_KEY") || process.env.NETLIFY_API_KEY || null;
    }
    result = await netlify.run(payload?.action || "deploy", payload?.data || payload);
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: result.success ? "completed" : "failed" });
    return result;
  }

  // ---------- MARKETPLACE ----------
  const marketplaceAdapter = getMarketplaceAdapter(agentType);
  if (marketplaceAdapter) {
    if (!marketplaceAdapter.credentials) {
      marketplaceAdapter.credentials = readSecret(`${agentType.toUpperCase()}_CREDENTIALS`) || process.env[`${agentType.toUpperCase()}_CREDENTIALS`] || null;
    }
    result = await marketplaceAdapter.run(payload?.action, payload?.data || payload);
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: result.success ? "completed" : "failed" });
    return result;
  }

  // ---------- TEXT AGENTS ----------
  if (["architect", "writer", "research", "engineer", "data"].includes(agentType)) {
    const engine = payload?.engine || defaultEngineForAgent(agentType);
    if (engine === "deepseek") {
      result = await runDeepseekTask({ mode: "execute", prompt: payload.prompt || payload.query, context: { agentType } });
    } else if (["architect", "writer", "research"].includes(agentType)) {
      result = await runClaudeTask(payload);
    } else {
      result = await runOpenAITask(payload);
    }
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: result.success ? "completed" : "failed" });
    return result;
  }

  // ---------- LOCAL + BROWSER ----------
  if (agentType === "local")        { result = await runLocalLLMTask(payload); }
  else if (agentType === "browser") { result = await runBrowserTask(payload); }
  if (result) {
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: result.success ? "completed" : "failed" });
    return result;
  }

  // ---------- VIDEO ----------
  if (agentType === "video") {
    const engine = payload?.engine || "runway";
    let res;
    if (engine === "runway")    res = await runRunwayTask(payload);
    else if (engine === "pika") res = await runPikaTask(payload);
    else if (engine === "luma") res = await runLumaTask(payload);
    else if (engine === "sora") res = await runSoraTask(payload);
    else return { success: false, error: `Executor: unknown video engine=${engine}` };
    if (!res.success) return res;
    const rec = await saveMediaRecord({ type: "video", engine, r2Key: null, publicUrl: res.url || null, meta: { payload } });
    result = { success: true, output: res.output, engine, url: res.url || null, mediaRecord: rec.success ? rec.record : null };
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: "completed" });
    return result;
  }

  // ---------- AUDIO ----------
  if (agentType === "audio") {
    const engine = payload?.engine || "elevenlabs";
    if (engine !== "elevenlabs") return { success: false, error: `Executor: unknown audio engine=${engine}` };
    const res = await runElevenLabsTask(payload);
    if (!res.success) return res;
    const upload = await uploadToR2({ buffer: res.buffer, contentType: "audio/mpeg", keyHint: "audio" });
    if (!upload.success) return { success: false, error: `R2 upload failed: ${upload.error}` };
    const rec = await saveMediaRecord({ type: "audio", engine, r2Key: upload.key, publicUrl: upload.publicUrl, meta: { payload } });
    result = { success: true, output: res.output, engine, url: upload.publicUrl, mediaRecord: rec.success ? rec.record : null };
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: "completed" });
    return result;
  }

  // ---------- IMAGE ----------
  if (agentType === "image") {
    const engine = payload?.engine || "dalle";
    let res;
    if (engine === "dalle")           res = await runDalleTask(payload);
    else if (engine === "midjourney") res = await runMidjourneyTask(payload);
    else return { success: false, error: `Executor: unknown image engine=${engine}` };
    if (!res.success) return res;
    const rec = await saveMediaRecord({ type: "image", engine, r2Key: null, publicUrl: res.url || null, meta: { payload } });
    result = { success: true, output: res.output, engine, url: res.url || null, mediaRecord: rec.success ? rec.record : null };
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: "completed" });
    return result;
  }

  // ---------- INTEGRATION CONNECTORS ----------
  const connector = getConnector(agentType);
  if (connector) {
    // Vault-aware key injection for connectors without a key
    if (!connector.apiKey) {
      const envKey = `${agentType.toUpperCase()}_API_KEY`;
      connector.apiKey = readSecret(envKey) || process.env[envKey] || null;
    }
    const action = payload?.action;
    const data   = payload?.data || payload;
    if (!action) return { success: false, error: `Executor: agentType="${agentType}" requires payload.action.` };
    result = await connector.run(action, data);
    logNodeRun({ nodeId: task.id, agentType, actorRole: requesterRole, snapshotId, payload, result, status: result.success ? "completed" : "failed" });
    return result;
  }

  return { success: false, error: `Executor: no connector for agentType=${agentType}` };
}

module.exports = { executeTask };
