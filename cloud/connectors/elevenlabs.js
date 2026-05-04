// cloud/connectors/elevenlabs.js
const axios = require("axios");

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;

if (!ELEVEN_API_KEY) {
  console.warn("[11labs] Warning: ELEVEN_API_KEY not set.");
}

async function runElevenLabsTask(payload = {}) {
  const {
    text,
    voice = "Rachel",
    model = "eleven_multilingual_v2",
  } = payload;

  if (!text) return { success: false, error: "ElevenLabs: missing text." };
  if (!ELEVEN_API_KEY) return { success: false, error: "ElevenLabs: ELEVEN_API_KEY missing." };

  try {
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      { text, model_id: model },
      {
        headers: {
          "xi-api-key": ELEVEN_API_KEY,
          "content-type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );
    return {
      success: true,
      output: "Audio generated.",
      raw: res.data,
      buffer: Buffer.from(res.data),
    };
  } catch (err) {
    return { success: false, error: err?.response?.data || err.message };
  }
}

module.exports = { runElevenLabsTask };
