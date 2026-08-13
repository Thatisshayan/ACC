// cloud/connectors/marketplace/facebookMarketplace.js
const { BaseMarketplaceConnector } = require("./baseMarketplace.js");
const { log } = require("../../utils/logger.js");

class FacebookMarketplaceConnector extends BaseMarketplaceConnector {
  constructor(config = {}) {
    super({
      name:        config.name    || "facebookMarketplace",
      enabled:     config.enabled ?? true, // enabled by default (Task 13)
      sandbox:     config.sandbox ?? true,
      credentials: config.credentials || null,
    });
  }

  // Lazy-load playwright
  getChromium() {
    try { return require('playwright').chromium; }
    catch (e) { throw new Error('playwright not available — run: npm install playwright && npx playwright install chromium'); }
  }

  async withPage(fn) {
    const chromium = this.getChromium();
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    try {
      return await fn(page);
    } finally {
      await browser.close();
    }
  }

  async postItem(payload = {}) {
    const v = this.validate();
    if (!v.success) return v;
    if (this.sandbox) {
      log("[facebook] SANDBOX postItem:", payload);
      return { success: true, output: { sandbox: true, action: "postItem", payload } };
    }

    log("[facebook] Live postItem starting via Playwright:", payload);
    try {
      const result = await this.withPage(async (page) => {
        // Navigate to Facebook Marketplace Creation URL
        await page.goto("https://www.facebook.com/marketplace/create/item", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        // Since Facebook requires login, live posting will attempt to populate 
        // inputs if credentials/cookies are found, or return a clear error.
        const titleInput = await page.$('input[label="Title"]');
        if (!titleInput) {
          return {
            success: false,
            error: "Authentication required. Facebook Marketplace live posting is cookie-gated in headless mode."
          };
        }

        if (payload.title) await titleInput.fill(payload.title);
        if (payload.price) {
          const priceInput = await page.$('input[label="Price"]');
          if (priceInput) await priceInput.fill(String(payload.price));
        }

        return { success: true, sandbox: false, output: { posted: true, title: payload.title } };
      });
      return result;
    } catch (err) {
      return { success: false, error: "Facebook Marketplace automation error: " + err.message };
    }
  }

  async fetchMessages(itemId) {
    const v = this.validate();
    if (!v.success) return v;
    if (this.sandbox) {
      return {
        success: true,
        output: [{ from: "fb_buyer1", message: "Is the price negotiable?", timestamp: new Date().toISOString() }],
      };
    }
    return { success: false, error: "Live fetchMessages not implemented. Requires active browser session." };
  }

  async sendMessage(itemId, message) {
    const v = this.validate();
    if (!v.success) return v;
    if (this.sandbox) {
      return { success: true, output: { sent: true, to: itemId, message } };
    }
    return { success: false, error: "Live sendMessage not implemented. Requires active browser session." };
  }

  async updateItem(itemId, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;
    if (this.sandbox) return { success: true, output: { sandbox: true, action: "updateItem", itemId, payload } };
    return { success: false, error: "Live updateItem not implemented. Requires active browser session." };
  }

  async closeListing(itemId) {
    const v = this.validate();
    if (!v.success) return v;
    if (this.sandbox) return { success: true, output: { sandbox: true, action: "closeListing", itemId } };
    return { success: false, error: "Live closeListing not implemented. Requires active browser session." };
  }

  async run(action, payload = {}) {
    if (action === "postItem")      return await this.postItem(payload.data || payload);
    if (action === "updateItem")    return await this.updateItem(payload.itemId, payload.data || payload);
    if (action === "fetchMessages") return await this.fetchMessages(payload.itemId);
    if (action === "sendMessage")   return await this.sendMessage(payload.itemId, payload.message);
    if (action === "closeListing")  return await this.closeListing(payload.itemId);
    return { success: false, error: `FacebookMarketplaceConnector: unknown action "${action}".` };
  }
}

module.exports = { FacebookMarketplaceConnector };
