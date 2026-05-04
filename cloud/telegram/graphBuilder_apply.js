// cloud/telegram/graphBuilder_apply.js
// Auto-apply workflow: search → merge → tailor resume → browser apply → log in ClickUp

/**
 * buildAutoApplyGraph
 * Full auto-apply pipeline:
 * LinkedIn + Indeed search → DeepSeek merge → Claude tailor resume
 * → Browser apply → ClickUp log
 *
 * @param {Object} params
 * @param {string} params.text     - job search query
 * @param {string} params.language
 * @param {string} params.userId
 * @param {string} params.role
 * @returns {Array} TaskNode[]
 */
async function buildAutoApplyGraph({ text, language, userId, role }) {
  return [
    // 1) LinkedIn search
    {
      id:        "LI_SEARCH",
      agentType: "linkedin",
      payload:   { action: "searchJobs", data: { query: text } },
      dependsOn: [],
      meta: { userId, role },
    },

    // 2) Indeed search
    {
      id:        "IN_SEARCH",
      agentType: "indeed",
      payload:   { action: "searchJobs", data: { query: text } },
      dependsOn: [],
      meta: { userId, role },
    },

    // 3) DeepSeek: merge + rank results
    {
      id:        "MERGE_JOBS",
      agentType: "deepseek",
      payload: {
        mode:   "validate",
        prompt: "Merge LinkedIn and Indeed job results. Remove duplicates. Rank by relevance to the query. Output a clean prioritized list of jobs to apply for.",
        language,
      },
      dependsOn: ["LI_SEARCH", "IN_SEARCH"],
      meta: { userId, role },
    },

    // 4) Claude: tailor resume per job
    {
      id:        "TAILOR_RESUME",
      agentType: "writer",
      payload: {
        prompt: "For each job in MERGE_JOBS: tailor the resume, match keywords, rewrite bullets, and optimize for ATS. Output one tailored version per job.",
        language,
      },
      dependsOn: ["MERGE_JOBS"],
      meta: { userId, role },
    },

    // 5) Browser: apply to jobs (automation stub — ready for Playwright)
    {
      id:        "APPLY",
      agentType: "browser",
      payload: {
        mode:           "apply",
        jobsFromNode:   "MERGE_JOBS",
        resumeFromNode: "TAILOR_RESUME",
        language,
      },
      dependsOn: ["TAILOR_RESUME"],
      meta: { userId, role },
    },

    // 6) ClickUp: log all applications
    {
      id:        "LOG",
      agentType: "clickup",
      payload: {
        action: "createTask",
        listId: process.env.CLICKUP_JOBS_LIST_ID || "REPLACE_JOBS_LIST_ID",
        data: {
          name:        `Applied to jobs for: ${text.slice(0, 60)}`,
          description: "ACC auto-apply summary. See APPLY node results for details.",
        },
      },
      dependsOn: ["APPLY"],
      meta: { userId, role },
    },
  ];
}

module.exports = { buildAutoApplyGraph };
