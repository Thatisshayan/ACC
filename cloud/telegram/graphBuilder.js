// cloud/telegram/graphBuilder.js
const { getUserProfile } = require("./users.js");

/**
 * buildGraphFromUserRequest
 * Converts a user's text/voice request into a role-aware TaskNode[] graph.
 *
 * @param {Object} params
 * @param {string} params.text     - user's request text
 * @param {string} params.language - "en" | "fa"
 * @param {string} params.userId   - Telegram user ID
 * @returns {Promise<Array>} TaskNode[]
 */
async function buildGraphFromUserRequest({ text, language, userId }) {
  const profile = getUserProfile(userId);
  const role    = profile?.role || "normal";

  return [
    {
      id:        "T1",
      agentType: "architect",
      payload:   { prompt: text, language },
      dependsOn: [],
      meta:      { userId, role },
    },
    {
      id:        "T2",
      agentType: "writer",
      payload:   { prompt: "Expand the plan into a full script.", language },
      dependsOn: ["T1"],
      meta:      { userId, role },
    },
    {
      id:        "T3",
      agentType: "deepseek",
      payload:   {
        mode:   "validate",
        prompt: "Validate the script for logic and clarity.",
        language,
      },
      dependsOn: ["T2"],
      meta:      { userId, role },
    },
  ];
}

/**
 * buildResearchGraphFromUserRequest
 * Research-focused graph: Browser search → visit → summarize → validate.
 * Use when user says "research", "find", "look up", "search for", etc.
 *
 * @param {Object} params
 * @param {string} params.text     - user's research query
 * @param {string} params.language - "en" | "fa"
 * @param {string} params.userId
 * @returns {Promise<Array>} TaskNode[]
 */
async function buildResearchGraphFromUserRequest({ text, language, userId }) {
  const profile = getUserProfile(userId);
  const role    = profile?.role || "normal";

  return [
    {
      id:        "B1",
      agentType: "browser",
      payload:   { mode: "search", query: text, language },
      dependsOn: [],
      meta:      { userId, role },
    },
    {
      id:        "B2",
      agentType: "browser",
      payload:   {
        mode:     "visit",
        url:      "https://example.com/1", // replaced at runtime with B1 result
        language,
      },
      dependsOn: ["B1"],
      meta:      { userId, role },
    },
    {
      id:        "R1",
      agentType: "research",
      payload:   { query: "Summarize the visited page content.", language },
      dependsOn: ["B2"],
      meta:      { userId, role },
    },
    {
      id:        "D1",
      agentType: "deepseek",
      payload:   {
        mode:   "validate",
        prompt: "Validate the summary for logic and clarity.",
        language,
      },
      dependsOn: ["R1"],
      meta:      { userId, role },
    },
  ];
}

module.exports = { buildGraphFromUserRequest, buildResearchGraphFromUserRequest };
