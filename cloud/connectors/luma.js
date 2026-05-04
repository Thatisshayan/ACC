// cloud/connectors/luma.js
const axios = require("axios");

const LUMA_API_KEY = process.env.LUMA_API_KEY;

if (!LUMA_API_KEY) {
  console.warn("[luma] Warning: LUMA_API_KEY not set.");
}

async function runLumaTask(payload = {}) {
  const { prompt, model = "dream-machine", ratio = "16:9" } = payload;

  if (!prompt) return { success: false, error: "Luma: missing prompt." };
  if (!LUMA_API_KEY) return { success: false, error: "Luma: LUMA_API_KEY missing." };

  try {
    const res = await axios.post(
      "https://api.lumalabs.ai/v1/videos",
      { prompt, model, ratio },
      { headers: { Authorization: `Bearer ${LUMA_API_KEY}`, "content-type": "application/json" } }
    );
    return { success: true, output: "Video generation started.", raw: res.data, url: res.data?.video_url || null };
  } catch (err) {
    return { success: false, error: err?.response?.data || err.message };
  }
}

module.exports = { runLumaTask };
