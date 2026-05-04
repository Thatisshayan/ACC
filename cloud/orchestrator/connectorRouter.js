// cloud/orchestrator/connectorRouter.js
const { getConnector }      = require("../connectors/registry.js");
const { CONNECTOR_SKILLS }  = require("../connectors/skills.js");

/**
 * pickConnectorsForIntent
 * Returns connector names whose capabilities include the given intent.
 * @param {string} intent
 * @returns {string[]}
 */
function pickConnectorsForIntent(intent) {
  const matches = [];
  for (const [name, skill] of Object.entries(CONNECTOR_SKILLS)) {
    if (skill.capabilities.includes(intent)) {
      matches.push(name);
    }
  }
  return matches;
}

/**
 * runConnectorAction
 * Looks up a connector by name and runs an action on it.
 * @param {string} name
 * @param {string} action
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
async function runConnectorAction(name, action, payload) {
  const connector = getConnector(name);
  if (!connector) {
    return { success: false, error: `Connector not loaded: ${name}` };
  }
  try {
    return await connector.run(action, payload);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { pickConnectorsForIntent, runConnectorAction };
