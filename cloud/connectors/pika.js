// cloud/connectors/pika.js
const axios = require("axios");

const PIKA_API_KEY = process.env.PIKA_API_KEY;

if (!PIKA_API_KEY) {
  console.warn("[pika] Warning: PIKA_API_KEY not set.");
}

async function runPikaTask(payload = {}) {
  const { prompt, model = "pika-1", ratio = "16:9" } = payload;

  if (!prompt) return { success: false, error: "Pika: missing prompt." };
  if (!PIKA_API_KEY) return { success: false, error: "Pika: PIKA_API_KEY missing." };

  try {
    const res = await axios.post(
      "https://api.pika.art/v1/videos",
      { prompt, model, ratio },
      { headers: { Authorization: `Bearer ${PIKA_API_KEY}`, "content-type": "application/json" } }
    );
    return { success: true, output: "Video generation started.", raw: res.data, url: res.data?.video_url || null };
  } catch (err) {
    return { success: false, error: err?.response?.data || err.message };
  }
}

module.exports = { runPikaTask };
