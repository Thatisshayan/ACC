// cloud/connectors/dalle.js
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("[dalle] Warning: OPENAI_API_KEY not set.");
}

async function runDalleTask(payload = {}) {
  const { prompt, size = "1024x1024", model = "gpt-image-1" } = payload;

  if (!prompt) return { success: false, error: "DALL-E: missing prompt." };
  if (!OPENAI_API_KEY) return { success: false, error: "DALL-E: OPENAI_API_KEY missing." };

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/images/generations",
      { prompt, size, model },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" } }
    );
    const url = res.data?.data?.[0]?.url || null;
    return { success: true, output: "Image generated.", raw: res.data, url };
  } catch (err) {
    return { success: false, error: err?.response?.data || err.message };
  }
}

module.exports = { runDalleTask };
