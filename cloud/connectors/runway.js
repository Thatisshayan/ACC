// cloud/connectors/runway.js
const axios = require("axios");

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;

if (!RUNWAY_API_KEY) {
  console.warn("[runway] Warning: RUNWAY_API_KEY not set.");
}

async function runRunwayTask(payload = {}) {
  const {
    prompt,
    model = "gen-2",
    duration = 5,
    ratio = "16:9",
  } = payload;

  if (!prompt) return { success: false, error: "Runway: missing prompt." };
  if (!RUNWAY_API_KEY) return { success: false, error: "Runway: RUNWAY_API_KEY missing." };

  try {
    const res = await axios.post(
      "https://api.runwayml.com/v1/videos",
      { prompt, model, duration, ratio },
      { headers: { Authorization: `Bearer ${RUNWAY_API_KEY}`, "content-type": "application/json" } }
    );
    return { success: true, output: "Video generation started.", raw: res.data, url: res.data?.video_url || null };
  } catch (err) {
    return { success: false, error: err?.response?.data || err.message };
  }
}

module.exports = { runRunwayTask };
