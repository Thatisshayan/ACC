// cloud/connectors/marketplace/baseMarketplace.js

class BaseMarketplaceConnector {
  constructor(config = {}) {
    this.name        = config.name        || "marketplace-base";
    this.enabled     = config.enabled     ?? true;
    this.sandbox     = config.sandbox     ?? true; // always default sandbox
    this.credentials = config.credentials || null;
  }

  validate() {
    if (!this.enabled) return { success: false, error: `${this.name} disabled.` };
    return { success: true };
  }

  async postItem(payload)             { throw new Error("postItem not implemented"); }
  async updateItem(itemId, payload)   { throw new Error("updateItem not implemented"); }
  async fetchMessages(itemId)         { throw new Error("fetchMessages not implemented"); }
  async sendMessage(itemId, message)  { throw new Error("sendMessage not implemented"); }
  async closeListing(itemId)          { throw new Error("closeListing not implemented"); }
}

module.exports = { BaseMarketplaceConnector };
