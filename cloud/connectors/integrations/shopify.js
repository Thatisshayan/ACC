// cloud/connectors/integrations/shopify.js
// Shopify Agent — read catalog, update inventory, sync orders

const SHOPIFY_API_KEY   = process.env.SHOPIFY_API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
if (!SHOPIFY_API_KEY) console.warn("[shopify] Warning: SHOPIFY_API_KEY not set.");

async function runShopifyTask(payload = {}) {
  const { action, productId, orderId } = payload;
  if (!SHOPIFY_API_KEY) return { success: false, error: "Shopify: missing API key." };
  if (!action) return { success: false, error: "Shopify: missing action." };
  console.warn("[shopify] Stub called. Implement with Shopify Admin REST API.");
  return { success: false, error: "Shopify connector not implemented.", meta: { action } };
}

module.exports = { runShopifyTask };
