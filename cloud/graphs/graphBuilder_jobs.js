// cloud/graphs/graphBuilder_jobs.js
async function buildJobSearchGraph({ text, language = "en", userId, role }) {
  return [
    { id: "PLAN",    agentType: "architect", payload: { prompt: `User wants job search help.\nQuery: "${text}"\nPlan the search steps.`, language }, dependsOn: [],                     meta: { userId, role } },
    { id: "LI1",     agentType: "linkedin",  payload: { action: "searchJobs", data: { query: text } },                                               dependsOn: ["PLAN"],               meta: { userId, role } },
    { id: "IN1",     agentType: "indeed",    payload: { action: "searchJobs", data: { query: text } },                                               dependsOn: ["PLAN"],               meta: { userId, role } },
    { id: "B1",      agentType: "browser",   payload: { mode: "search", query: `${text} jobs`, language },                                           dependsOn: ["PLAN"],               meta: { userId, role } },
    { id: "MERGE",   agentType: "merge",     payload: { mergeType: "job_search", sources: ["LI1", "IN1", "B1"] },                                   dependsOn: ["LI1", "IN1", "B1"],  meta: { userId, role } },
    { id: "SUMMARY", agentType: "writer",    payload: { prompt: "Summarize merged job search results into a clean readable list.", language },        dependsOn: ["MERGE"],              meta: { userId, role } },
  ];
}

module.exports = { buildJobSearchGraph };
