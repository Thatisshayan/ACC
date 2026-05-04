// cloud/connectors/whisper.js
const fetch = require("node-fetch");
const { FormData, File } = require("formdata-node");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("[whisper] Warning: OPENAI_API_KEY is not set.");
}

/**
 * transcribeAudioWithWhisper
 * @param {Buffer} buffer     - raw audio buffer
 * @param {string} filename   - e.g. "audio.ogg", "audio.mp3"
 */
async function transcribeAudioWithWhisper(buffer, filename = "audio.ogg") {
  if (!OPENAI_API_KEY) {
    return { success: false, error: "Whisper: missing OPENAI_API_KEY." };
  }
  if (!buffer) {
    return { success: false, error: "Whisper: missing audio buffer." };
  }

  try {
    const formData = new FormData();
    const file = new File([buffer], filename, { type: "audio/ogg" });
    formData.append("file", file);
    formData.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Whisper HTTP ${res.status}: ${text}` };
    }

    const json = await res.json();
    return { success: true, text: json.text || "", raw: json };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { transcribeAudioWithWhisper };
