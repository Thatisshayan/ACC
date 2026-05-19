// cloud/integrations/alphonso.js
// Alphonso local agent connector for ACC v2
// Bridges ACC Task Bus to Alphonso/Ollama local AI ecosystem

const axios = require('axios');

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const ALPHONSO_ENABLED = process.env.ALPHONSO_ENABLED === 'true';
const ALPHONSO_DEFAULT_MODEL = process.env.ALPHONSO_DEFAULT_MODEL || 'llama3';
const ALPHONSO_RESEARCH_MODEL = process.env.ALPHONSO_RESEARCH_MODEL || 'llama3';
const ALPHONSO_CREATIVE_MODEL = process.env.ALPHONSO_CREATIVE_MODEL || 'llama3';

/**
 * Check if Alphonso connector is enabled and Ollama is reachable
 */
async function enabled() {
  if (!ALPHONSO_ENABLED) return false;
  try {
    await axios.get(`${OLLAMA_ENDPOINT}/api/tags`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check health of Ollama backend
 */
async function checkHealth() {
  try {
    const response = await axios.get(`${OLLAMA_ENDPOINT}/api/tags`, { timeout: 5000 });
    return { status: 'ok', models: response.data.models || [] };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

/**
 * Run a task on Ollama with given model and prompt
 */
async function runOllamaTask(model, prompt) {
  try {
    const response = await axios.post(`${OLLAMA_ENDPOINT}/api/generate`, {
      model,
      prompt,
      stream: false
    }, { timeout: 30000 });
    return { success: true, output: response.data.response, model_used: model };
  } catch (error) {
    return { success: false, output: null, model_used: model, error: error.message };
  }
}

/**
 * Send a task from ACC to Alphonso
 * Routes to appropriate model based on task type
 */
async function sendTaskFromACC(accTask) {
  let model = ALPHONSO_DEFAULT_MODEL;
  let prompt = accTask.prompt || accTask.description || '';

  // Route to appropriate agent/model
  if (accTask.type === 'research' || accTask.agent === 'hector') {
    model = ALPHONSO_RESEARCH_MODEL;
  } else if (accTask.type === 'creative' || accTask.agent === 'miya') {
    model = ALPHONSO_CREATIVE_MODEL;
  }

  return await runOllamaTask(model, prompt);
}

/**
 * List available Ollama models
 */
async function listModels() {
  try {
    const response = await axios.get(`${OLLAMA_ENDPOINT}/api/tags`, { timeout: 5000 });
    return response.data.models || [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  enabled,
  checkHealth,
  runOllamaTask,
  sendTaskFromACC,
  listModels
};