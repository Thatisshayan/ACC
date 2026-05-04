// cloud/connectors/gmail.js
const { BaseConnector } = require("./baseConnector.js");

class GmailConnector extends BaseConnector {
  constructor(config = {}) {
    super({ name: config.name || "gmail", version: config.version || "1.0.0", enabled: config.enabled ?? true });
    if (!process.env.GMAIL_CLIENT_ID) console.warn("[gmail] Warning: GMAIL_CLIENT_ID not set.");
  }

  async run(action, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;

    if (action === "sendEmail") {
      // Stub: replace with googleapis npm package + OAuth2
      if (!payload.to) return { success: false, error: "Gmail: missing 'to' field." };
      return { success: true, output: `Email sent to ${payload.to}` };
    }

    if (action === "readEmails") {
      return {
        success: true,
        output: [
          { id: "msg_1", subject: "Hello", from: "sender@example.com", snippet: "Hi there..." },
        ],
      };
    }

    if (action === "summarizeThread") {
      return { success: true, output: "Thread summary stub." };
    }

    return { success: false, error: `Gmail: unknown action "${action}".` };
  }
}

module.exports = { GmailConnector };
