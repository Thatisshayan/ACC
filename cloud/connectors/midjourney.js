// cloud/connectors/midjourney.js

async function runMidjourneyTask(payload = {}) {
  const { prompt } = payload;

  if (!prompt) {
    return { success: false, error: "Midjourney: missing prompt." };
  }

  console.warn("[midjourney] Stub called. Requires Discord bot integration.");

  return {
    success: false,
    error: "Midjourney connector not implemented (Discord automation required).",
  };
}

module.exports = { runMidjourneyTask };
