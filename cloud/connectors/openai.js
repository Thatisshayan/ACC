// cloud/connectors/openai.js
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("[openai] Warning: OPENAI_API_KEY is not set.");
}

/**
 * runOpenAITask
 * Normalized interface: { success, output?, raw?, error? }
 */
async function runOpenAITask(payload = {}) {
  const {
    prompt,
    system = "You are a precise, structured, high-clarity assistant.",
    model = "gpt-4.1-mini",
    maxTokens = 4096,
  } = payload;

  if (!prompt) {
    return { success: false, error: "OpenAI connector: missing prompt." };
  }

  if (!OPENAI_API_KEY) {
    return { success: false, error: "OpenAI connector: OPENAI_API_KEY missing." };
  }

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
      }
    );

    const content = res.data?.choices?.[0]?.message?.content || "";

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

module.exports = { runOpenAITask };
