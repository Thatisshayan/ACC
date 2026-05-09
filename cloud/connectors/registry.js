// cloud/connectors/registry.js
// Auto-discovery registry: loads connectors from manifest.json.
// Hot-reloads when manifest or any .js file in the connectors dir changes.

const fs   = require("fs");
const path = require("path");
const { readSecret } = require("../security/vaultStub.js");

const CONNECTORS_DIR  = __dirname;
const MANIFEST_PATH   = path.join(__dirname, "manifest.json");

const registry = new Map(); // name → connector instance

/**
 * loadConnectors
 * Reads manifest.json and instantiates each enabled connector.
 * Safe to call multiple times (hot reload).
 */
function loadConnectors() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.warn("[connectors] manifest.json not found.");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (err) {
    console.error("[connectors] Failed to parse manifest.json:", err.message);
    return;
  }

  for (const entry of manifest.connectors || []) {
    if (!entry.enabled) continue;

    const filePath = path.join(CONNECTORS_DIR, entry.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[connectors] File not found: ${entry.file}`);
      continue;
    }

    try {
      // Clear require cache for hot reload
      delete require.cache[require.resolve(filePath)];

      const mod            = require(filePath);
      const ConnectorClass = Object.values(mod)[0]; // first export = the class

      if (typeof ConnectorClass !== "function") {
        console.warn(`[connectors] ${entry.file} does not export a class.`);
        continue;
      }

      const apiKey   = entry.apiKeyEnv
        ? (readSecret(entry.apiKeyEnv) || process.env[entry.apiKeyEnv] || null)
        : null;
      const instance = new ConnectorClass({
        name:    entry.name,
        version: entry.version,
        apiKey,
        enabled: entry.enabled,
      });

      registry.set(entry.name, instance);
      console.log(`[connectors] Loaded: ${entry.name} v${entry.version}`);
    } catch (err) {
      console.error(`[connectors] Failed to load ${entry.name}:`, err.message);
    }
  }
}

/**
 * getConnector
 * @param {string} name
 * @returns {BaseConnector|null}
 */
function getConnector(name) {
  return registry.get(name) || null;
}

/**
 * listConnectors
 * Returns metadata for all loaded connectors.
 */
function listConnectors() {
  return [...registry.values()].map(c => ({
    name:      c.name,
    version:   c.version,
    enabled:   c.enabled,
    hasApiKey: !!c.apiKey,
  }));
}

// ── Hot reload (disabled — causes noise in REDACTED) ────────────────────────
// Uncomment to re-enable during development:
// fs.watch(CONNECTORS_DIR, { recursive: false }, (eventType, filename) => {
//   if (!filename) return;
//   if (!filename.endsWith(".js") && filename !== "manifest.json") return;
//   console.log(`[connectors] Change detected in ${filename}, reloading...`);
//   loadConnectors();
// });

// ── Initial load ───────────────────────────────────────────────────────────────
loadConnectors();

module.exports = { loadConnectors, getConnector, listConnectors, registry };
