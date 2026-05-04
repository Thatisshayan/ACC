// cloud/telegram/graphBuilder_resume.js
// Tailored resume workflow: fetch job desc + base resume → tailor → validate → save

/**
 * buildTailoredResumeGraph
 * Fetches job description + base resume, tailors with Claude,
 * validates with DeepSeek, saves result to Notion.
 *
 * @param {Object} params
 * @param {string} params.text     - job title / description query
 * @param {string} params.language
 * @param {string} params.userId
 * @param {string} params.role
 * @returns {Array} TaskNode[]
 */
async function buildTailoredResumeGraph({ text, language, userId, role }) {
  return [
    // 1) Browser: fetch job description
    {
      id:        "JOB_DESC",
      agentType: "browser",
      payload:   { mode: "search", query: `${text} job description`, language },
      dependsOn: [],
      meta: { userId, role },
    },

    // 2) Notion: fetch base resume
    {
      id:        "BASE_RESUME",
      agentType: "notion",
      payload: {
        action: "readPage",
        data:   { pageId: process.env.NOTION_RESUME_PAGE_ID || "REPLACE_RESUME_PAGE_ID" },
      },
      dependsOn: [],
      meta: { userId, role },
    },

    // 3) Claude: tailor resume for the job
    {
      id:        "TAILOR",
      agentType: "writer",
      payload: {
        prompt: `You are tailoring a resume for a specific job.\n\nInputs:\n- Job description (from JOB_DESC)\n- Base resume (from BASE_RESUME)\n\nOutput:\n- A rewritten resume optimized for ATS\n- Highlight matching skills\n- Rewrite bullets to match job requirements\n- Keep it concise and professional`,
        language,
      },
      dependsOn: ["JOB_DESC", "BASE_RESUME"],
      meta: { userId, role },
    },

    // 4) DeepSeek: validate resume quality
    {
      id:        "VALIDATE",
      agentType: "deepseek",
      payload: {
        mode:   "validate",
        prompt: "Validate the tailored resume for: ATS compatibility, clarity, keyword matching, and strong bullet points. Suggest specific improvements.",
        language,
      },
      dependsOn: ["TAILOR"],
      meta: { userId, role },
    },

    // 5) Notion: save tailored resume
    {
      id:        "SAVE",
      agentType: "notion",
      payload: {
        action: "createPage",
        data: {
          parent:     { database_id: process.env.NOTION_RESUMES_DB_ID || "REPLACE_RESUMES_DB_ID" },
          properties: { Name: { title: [{ text: { content: `Resume for ${text.slice(0, 50)}` } }] } },
        },
      },
      dependsOn: ["VALIDATE"],
      meta: { userId, role },
    },
  ];
}

module.exports = { buildTailoredResumeGraph };
