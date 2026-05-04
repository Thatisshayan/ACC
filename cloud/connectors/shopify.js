// cloud/connectors/shopify.js
const { BaseConnector } = require("./baseConnector.js");

class ShopifyConnector extends BaseConnector {
  constructor(config = {}) {
    super({ name: config.name || "shopify", version: config.version || "1.0.0", apiKey: config.apiKey || process.env.SHOPIFY_API_KEY, enabled: config.enabled ?? true });
    if (!this.apiKey) console.warn("[shopify] Warning: SHOPIFY_API_KEY not set.");
  }

  async run(action, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;

    // Stub: replace with Shopify Admin REST API calls
    if (action === "getProducts") {
      return {
        success: true,
        output: [
          { id: 1, title: "T-Shirt", price: 29.99 },
          { id: 2, title: "Hoodie",  price: 59.99 },
        ],
      };
    }

    if (action === "updateInventory") {
      return { success: true, output: { productId: payload.productId, updated: true } };
    }

    if (action === "syncOrders") {
      return { success: true, output: { orders: [], syncedAt: new Date().toISOString() } };
    }

    return { success: false, error: `Shopify: unknown action "${action}".` };
  }
}

module.exports = { ShopifyConnector };
