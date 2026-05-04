// cloud/graphs/landingPageBuilder.js
// Landing page workflow: plan → copy → HTML build → deploy (Netlify, approval required) → log

async function buildLandingPageGraph({ text, language = "en", userId, role }) {
  return [
    {
      id: "PLAN", agentType: "architect",
      payload: { prompt: `Create a landing page brief for: ${text}`, language },
      dependsOn: [], meta: { userId, role },
    },
    {
      id: "COPY", agentType: "writer",
      payload: { prompt: "Write landing page copy using the PLAN output. Include: headline, subheadline, 3 benefits, CTA, meta title, meta description.", language },
      dependsOn: ["PLAN"], meta: { userId, role },
    },
    {
      id: "PAGE_BUILD", agentType: "engineer",
      payload: { prompt: "Generate a clean HTML+CSS landing page using the COPY output. Include inline styles. Provide complete HTML file content.", language },
      dependsOn: ["COPY"], meta: { userId, role },
    },
    {
      id: "DEPLOY", agentType: "netlify",
      payload: { action: "deploy", data: { sourceNode: "PAGE_BUILD", siteName: `landing-${Date.now()}`, sandbox: true } },
      dependsOn: ["PAGE_BUILD"],
      meta: { userId, role, requiresApproval: true, allowedRoles: ["Admin", "Operator"] },
    },
    {
      id: "LOG", agentType: "clickup",
      payload: { action: "createTask", listId: process.env.CLICKUP_JOB_LIST_ID || "REPLACE_CLICKUP_JOB_LIST", data: { name: `Landing page: ${text.slice(0, 60)}`, description: "Deployed by ACC landing page builder." } },
      dependsOn: ["DEPLOY"], meta: { userId, role },
    },
  ];
}

module.exports = { buildLandingPageGraph };
