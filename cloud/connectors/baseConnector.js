// cloud/connectors/baseConnector.js

class BaseConnector {
  constructor(config = {}) {
    this.name    = config.name    || "unnamed_connector";
    this.version = config.version || "1.0.0";
    this.enabled = config.enabled ?? true;
    this.apiKey  = config.apiKey  || null;
  }

  /**
   * validate
   * Check connector is enabled and (optionally) has required config.
   * @returns {{ success: boolean, error?: string }}
   */
  validate() {
    if (!this.enabled) {
      return { success: false, error: `${this.name} is disabled.` };
    }
    return { success: true };
  }

  /**
   * run
   * Execute a connector action. Must be overridden by subclasses.
   * @param {string} action
   * @param {Object} payload
   */
  async run(action, payload) {
    throw new Error(`Connector ${this.name} does not implement run().`);
  }
}

module.exports = { BaseConnector };
