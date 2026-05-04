// scripts/smokeTest_sandbox.js
// Run: node scripts/smokeTest_sandbox.js
// Verifies sandbox mode for marketplace, landing page, and content pipeline.

const { getMarketplaceAdapter }    = require("../cloud/connectors/marketplace/registry.js");
const { buildLandingPageGraph }    = require("../cloud/graphs/landingPageBuilder.js");
const { buildContentPipelineGraph }= require("../cloud/graphs/contentPipeline_seo.js");
const { runGraph }                 = require("../cloud/graphRunner.js");
const { log }                      = require("../cloud/utils/logger.js");

async function testKijijiPost() {
  log("--- Kijiji sandbox post ---");
  const kijiji = getMarketplaceAdapter("kijiji");
  if (!kijiji) { log("Kijiji adapter not loaded."); return; }
  const res = await kijiji.run("postItem", { data: { title: "SMOKE TEST ITEM", description: "Sandbox listing", price: 1 } });
  log("Kijiji result:", res.success, res.output?.sandbox ? "(sandbox)" : "(live!)");
}

async function testLandingPage() {
  log("--- Landing page graph ---");
  const nodes    = await buildLandingPageGraph({ text: "Test landing page", userId: "smoke", role: "Operator" });
  const snapshot = await runGraph(nodes, { role: "Operator", taskId: "smoke-landing" });
  log("Landing page nodes run:", Object.keys(snapshot.outputs).join(", "));
}

async function testContentPipeline() {
  log("--- SEO content pipeline ---");
  const nodes    = await buildContentPipelineGraph({ text: "SEO smoke test", userId: "smoke", role: "Marketing" });
  const snapshot = await runGraph(nodes, { role: "Marketing", taskId: "smoke-content" });
  log("Content pipeline nodes run:", Object.keys(snapshot.outputs).join(", "));
}

(async () => {
  log("ACC v2 smoke tests starting (sandbox mode)...");
  await testKijijiPost();
  await testLandingPage();
  await testContentPipeline();
  log("Smoke tests complete.");
  process.exit(0);
})();
