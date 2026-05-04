// cloud/graphs/graphBuilder_apply.js
async function buildAutoApplyGraph({ text, language = "en", userId, role }) {
  return [
    { id: "LI_SEARCH",    agentType: "linkedin", payload: { action: "searchJobs", data: { query: text } },                                                                                                                                                                                     dependsOn: [],                         meta: { userId, role } },
    { id: "IN_SEARCH",    agentType: "indeed",   payload: { action: "searchJobs", data: { query: text } },                                                                                                                                                                                     dependsOn: [],                         meta: { userId, role } },
    { id: "MERGE_JOBS",   agentType: "merge",    payload: { mergeType: "job_search", sources: ["LI_SEARCH", "IN_SEARCH"] },                                                                                                                                                                    dependsOn: ["LI_SEARCH","IN_SEARCH"],  meta: { userId, role } },
    { id: "TAILOR_RESUME",agentType: "writer",   payload: { prompt: "Tailor resume for each job in MERGE_JOBS.", language },                                                                                                                                                                    dependsOn: ["MERGE_JOBS"],             meta: { userId, role } },
    { id: "APPLY",        agentType: "browser",  payload: { mode: "apply", jobsFromNode: "MERGE_JOBS", resumeFromNode: "TAILOR_RESUME", language },                                                                                                                                            dependsOn: ["TAILOR_RESUME"],          meta: { userId, role } },
    { id: "LOG",          agentType: "clickup",  payload: { action: "createTask", listId: process.env.CLICKUP_JOB_LIST_ID || "REPLACE_CLICKUP_JOB_LIST", data: { name: `Applied to jobs for: ${text.slice(0,60)}`, description: "ACC auto-apply summary." } },                                dependsOn: ["APPLY"],                  meta: { userId, role } },
  ];
}

module.exports = { buildAutoApplyGraph };
