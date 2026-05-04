// cloud/connectors/notion.js
const fetch = require("node-fetch");
const { BaseConnector } = require("./baseConnector.js");

class NotionConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      name:    config.name    || "notion",
      version: config.version || "1.0.0",
      apiKey:  config.apiKey  || process.env.NOTION_API_KEY,
      enabled: config.enabled ?? true,
    });
    if (!this.apiKey) console.warn("[notion] Warning: NOTION_API_KEY not set.");
  }

  async run(action, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;
    if (!this.apiKey) return { success: false, error: "Notion: missing NOTION_API_KEY." };

    const headers = {
      "Authorization":  `Bearer ${this.apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type":   "application/json",
    };

    try {
      if (action === "readPage") {
        const res  = await fetch(`https://api.notion.com/v1/pages/${payload.pageId}`, { headers });
        const json = await res.json();
        return { success: true, output: json };
      }

      if (action === "writePage") {
        const res  = await fetch("https://api.notion.com/v1/pages", {
          method: "POST", headers, body: JSON.stringify(payload),
        });
        const json = await res.json();
        return { success: true, output: json };
      }

      if (action === "queryDatabase") {
        const res  = await fetch(`https://api.notion.com/v1/databases/${payload.databaseId}/query`, {
          method: "POST", headers, body: JSON.stringify(payload.filter || {}),
        });
        const json = await res.json();
        return { success: true, output: json };
      }

      return { success: false, error: `Notion: unknown action "${action}".` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = { NotionConnector };
