// cloud/connectors/clickup.js
const fetch = require("node-fetch");
const { BaseConnector } = require("./baseConnector.js");

class ClickUpConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      name:    config.name    || "clickup",
      version: config.version || "1.0.0",
      apiKey:  config.apiKey  || process.env.CLICKUP_API_KEY,
      enabled: config.enabled ?? true,
    });
    if (!this.apiKey) console.warn("[clickup] Warning: CLICKUP_API_KEY not set.");
  }

  async run(action, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;
    if (!this.apiKey) return { success: false, error: "ClickUp: missing CLICKUP_API_KEY." };

    const headers = {
      "Authorization": this.apiKey,
      "Content-Type":  "application/json",
    };

    try {
      if (action === "createTask") {
        const res  = await fetch(`https://api.clickup.com/api/v2/list/${payload.listId}/task`, {
          method: "POST", headers, body: JSON.stringify(payload.data),
        });
        const json = await res.json();
        return { success: true, output: json };
      }

      if (action === "updateTask") {
        const res  = await fetch(`https://api.clickup.com/api/v2/task/${payload.taskId}`, {
          method: "PUT", headers, body: JSON.stringify(payload.data),
        });
        const json = await res.json();
        return { success: true, output: json };
      }

      if (action === "addComment") {
        const res  = await fetch(`https://api.clickup.com/api/v2/task/${payload.taskId}/comment`, {
          method: "POST", headers, body: JSON.stringify({ comment_text: payload.comment }),
        });
        const json = await res.json();
        return { success: true, output: json };
      }

      return { success: false, error: `ClickUp: unknown action "${action}".` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = { ClickUpConnector };
