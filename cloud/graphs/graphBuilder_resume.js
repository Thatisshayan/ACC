// cloud/graphs/graphBuilder_resume.js
async function buildTailoredResumeGraph({ text, language = "en", userId, role }) {
  return [
    { id: "JOB_DESC",    agentType: "browser",  payload: { mode: "search", query: `${text} job description`, language },                                                                                                                                          dependsOn: [],                       meta: { userId, role } },
    { id: "BASE_RESUME", agentType: "notion",   payload: { action: "readPage", data: { pageId: process.env.RESUME_PAGE_ID || "REPLACE_RESUME_PAGE_ID" } },                                                                                                        dependsOn: [],                       meta: { userId, role } },
    { id: "TAILOR",      agentType: "writer",   payload: { prompt: "Tailor the base resume to the job description. Use JOB_DESC and BASE_RESUME. Output a rewritten resume optimized for ATS.", language },                                                        dependsOn: ["JOB_DESC","BASE_RESUME"], meta: { userId, role } },
    { id: "VALIDATE",    agentType: "deepseek", payload: { mode: "validate", prompt: "Validate the tailored resume for ATS compatibility and clarity.", language },                                                                                                 dependsOn: ["TAILOR"],               meta: { userId, role } },
    { id: "SAVE",        agentType: "notion",   payload: { action: "createPage", data: { parent: { database_id: process.env.TAILORED_RESUMES_DB || "REPLACE_TAILORED_RESUMES_DB" }, properties: { Name: { title: [{ text: { content: `Resume for ${text}` } }] } } } }, dependsOn: ["VALIDATE"],             meta: { userId, role } },
  ];
}

module.exports = { buildTailoredResumeGraph };
