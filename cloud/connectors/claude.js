// cloud/connectors/claude.js
const axios = require("axios");

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

if (!CLAUDE_API_KEY) {
  console.warn("[claude] Warning: CLAUDE_API_KEY is not set.");
}

/**
 * runClaudeTask
 * Normalized interface: { success, output?, raw?, error? }
 */
async function runClaudeTask(payload = {}) {
  const {
    prompt,
    system = "You are a precise, structured, high-clarity assistant.",
    model = "claude-3-opus-20240229",
    maxTokens = 4096,
  } = payload;

  if (!prompt) {
    return { success: false, error: "Claude connector: missing prompt." };
  }

  if (!CLAUDE_API_KEY) {
    return { success: false, error: "Claude connector: CLAUDE_API_KEY missing." };
  }

  try {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    const content = res.data?.content?.[0]?.text || "";

    return {
      success: true,
      output: content,
      raw: res.data,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.response?.data || err.message,
    };
  }
}

module.exports = { runClaudeTask };
