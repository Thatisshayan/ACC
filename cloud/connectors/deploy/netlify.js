// cloud/connectors/deploy/netlify.js
const { BaseConnector } = require("../baseConnector.js");

class NetlifyConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      name:    config.name    || "netlify",
      apiKey:  config.apiKey  || process.env.NETLIFY_API_KEY,
      enabled: config.enabled ?? true,
    });
    if (!this.apiKey) console.warn("[netlify] Warning: NETLIFY_API_KEY not set.");
  }

  async run(action, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;

    if (action === "deploy") {
      // Sandbox/dry-run mode — always safe default
      if (!this.apiKey || payload.sandbox || payload.dryRun) {
        return {
          success: true,
          output: {
            sandbox: true,
            site:    payload.siteName || `acc-site-${Date.now()}`,
            url:     `https://sandbox-${Date.now()}.netlify.app`,
          },
        };
      }
      // TODO: implement via Netlify API (POST /sites/{site_id}/deploys)
      return { success: false, error: "Netlify live deploy not implemented. Provide NETLIFY_API_KEY and implement API call." };
    }

    return { success: false, error: `NetlifyConnector: unknown action "${action}".` };
  }
}

module.exports = { NetlifyConnector };
