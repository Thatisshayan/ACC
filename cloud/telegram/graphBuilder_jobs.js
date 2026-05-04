// cloud/telegram/graphBuilder_jobs.js
// Job-search workflow: Plan → LinkedIn + Indeed + Browser → Merge → Summary

/**
 * buildJobSearchGraph
 * Full multi-agent job search workflow.
 * Claude plans → LinkedIn + Indeed + Browser search in parallel
 * → DeepSeek merges/deduplicates → Claude produces clean summary
 *
 * @param {Object} params
 * @param {string} params.text
 * @param {string} params.language
 * @param {string} params.userId
 * @param {string} params.role
 * @returns {Array} TaskNode[]
 */
async function buildJobSearchGraph({ text, language, userId, role }) {
  return [
    // 1) Planning node
    {
      id:        "PLAN",
      agentType: "architect",
      payload: {
        prompt:   `User wants job search help.\nQuery: "${text}"\nPlan the search steps.`,
        language,
      },
      dependsOn: [],
      meta: { userId, role },
    },

    // 2) LinkedIn search
    {
      id:        "LI1",
      agentType: "linkedin",
      payload:   { action: "searchJobs", data: { query: text } },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    },

    // 3) Indeed search
    {
      id:        "IN1",
      agentType: "indeed",
      payload:   { action: "searchJobs", data: { query: text } },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    },

    // 4) Browser fallback + extra research
    {
      id:        "B1",
      agentType: "browser",
      payload:   { mode: "search", query: `${text} jobs Toronto`, language },
      dependsOn: ["PLAN"],
      meta: { userId, role },
    },

    // 5) DeepSeek: merge + deduplicate + validate
    {
      id:        "MERGE",
      agentType: "deepseek",
      payload: {
        mode:   "validate",
        prompt: "Merge and validate job search results from LinkedIn, Indeed, and Browser. Remove duplicates and produce a clean ranked list.",
        language,
      },
      dependsOn: ["LI1", "IN1", "B1"],
      meta: { userId, role },
    },

    // 6) Claude: final user-facing summary
    {
      id:        "SUMMARY",
      agentType: "writer",
      payload: {
        prompt:   "Summarize the merged job search results into a clean, readable list. Highlight job title, company, location, and why it matches the user's query.",
        language,
      },
      dependsOn: ["MERGE"],
      meta: { userId, role },
    },
  ];
}

module.exports = { buildJobSearchGraph };
