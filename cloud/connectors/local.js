// cloud/connectors/local.js

/**
 * runLocalLLMTask
 * Stub for Ollama / local models.
 */
async function runLocalLLMTask(payload = {}) {
  const { prompt, model = "llama3" } = payload;

  if (!prompt) {
    return { success: false, error: "Local LLM: missing prompt." };
  }

  console.warn("[local-llm] Stub called. Implement Ollama or local backend.");

  return {
    success: false,
    error: "Local LLM connector not implemented.",
    meta: { model },
  };
}

module.exports = { runLocalLLMTask };
