// cloud/connectors/marketplace/registry.js
// Auto-discovery registry for marketplace adapters.
const fs   = require("fs");
const path = require("path");

const MARKETPLACE_DIR  = __dirname;
const MANIFEST_PATH    = path.join(__dirname, "manifest.marketplace.json");
const registry         = new Map();

function loadMarketplaceAdapters(manifestPath = MANIFEST_PATH) {
  if (!fs.existsSync(manifestPath)) {
    console.warn("[marketplace] manifest.marketplace.json not found.");
    return;
  }

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (err) { console.error("[marketplace] Failed to parse manifest:", err.message); return; }

  for (const entry of manifest.connectors || []) {
    if (!entry.enabled) continue;
    const filePath = path.join(MARKETPLACE_DIR, entry.file);
    if (!fs.existsSync(filePath)) { console.warn(`[marketplace] File not found: ${entry.file}`); continue; }

    try {
      delete require.cache[require.resolve(filePath)];
      const mod            = require(filePath);
      const ConnectorClass = Object.values(mod)[0];
      const instance       = new ConnectorClass({
        name:    entry.name,
        enabled: entry.enabled,
        sandbox: entry.sandbox ?? true,
        credentials: entry.credentials || null,
      });
      registry.set(entry.name, instance);
      console.log(`[marketplace] Loaded adapter: ${entry.name} (sandbox:${instance.sandbox})`);
    } catch (err) {
      console.error(`[marketplace] Failed to load ${entry.name}:`, err.message);
    }
  }
}

function getMarketplaceAdapter(name) { return registry.get(name) || null; }
function listMarketplaceAdapters()   { return [...registry.keys()]; }

// Hot reload disabled — uncomment for dev
// fs.watch(MARKETPLACE_DIR, { recursive: false }, (eventType, filename) => {
//   if (!filename) return;
//   if (!filename.endsWith(".js") && filename !== "manifest.marketplace.json") return;
//   loadMarketplaceAdapters();
// });

// Initial load
loadMarketplaceAdapters();

module.exports = { loadMarketplaceAdapters, getMarketplaceAdapter, listMarketplaceAdapters, registry };
