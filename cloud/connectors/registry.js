// cloud/connectors/registry.js
// Auto-discovery registry: loads connectors from manifest.json.
// Hot-reloads when manifest or any .js file in the connectors dir changes.

const fs   = require("fs");
const path = require("path");
const { BaseConnector } = require("./baseConnector.js");
const { readSecret } = require("../security/vaultStub.js");

const CONNECTORS_DIR  = __dirname;
const MANIFEST_PATH   = path.join(__dirname, "manifest.json");

const registry = new Map(); // name → connector instance

class LegacyConnectorAdapter extends BaseConnector {
  constructor(config = {}, mod = {}) {
    super(config);
    this.mod = mod;
  }

  async checkHealth() {
    if (typeof this.mod.checkHealth === "function") {
      return this.mod.checkHealth();
    }
    return { status: this.enabled ? "connected" : "disabled", note: "Legacy connector adapter fallback." };
  }

  async run(action, payload = {}) {
    if (typeof this.mod.run === "function") {
      return this.mod.run(action, payload);
    }

    if (typeof this.mod.sendTaskFromACC === "function") {
      return this.mod.sendTaskFromACC(Object.assign({ action: action }, payload));
    }

    if (typeof this.mod[action] === "function") {
      try {
        switch (this.name) {
          case "clickup":
            if (action === "createTask") return this.mod.createTask(payload.listId || payload.list_id || payload.list || "", payload.data || payload);
            if (action === "updateTask") return this.mod.updateTask(payload.taskId || payload.task_id || payload.id, payload.data || payload);
            if (action === "getTasks") return this.mod.getTasks(payload.listId || payload.list_id || payload.list || "");
            if (action === "getTeams") return this.mod.getTeams();
            if (action === "checkHealth") return this.mod.checkHealth();
            break;
          case "airtable":
            if (action === "createRecord") return this.mod.createRecord(payload.table || payload.tableName || "", payload.fields || payload.data || payload);
            if (action === "updateRecord") return this.mod.updateRecord(payload.table || payload.tableName || "", payload.recordId || payload.id || "", payload.fields || payload.data || payload);
            if (action === "findRecords") return this.mod.findRecords(payload.table || payload.tableName || "", payload.filterFormula || payload.filter || "", payload.maxRecords);
            if (action === "syncTask") return this.mod.syncTask(payload.task || payload, payload.result || payload.data || {});
            if (action === "syncUser") return this.mod.syncUser(payload.user || payload.data || payload);
            if (action === "syncApproval") return this.mod.syncApproval(payload.approval || payload.data || payload, payload.task || payload.taskData || {});
            if (action === "checkHealth") return this.mod.checkHealth();
            break;
          default:
            break;
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: `Connector ${this.name} does not implement action "${action}".` };
  }
}

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

      const apiKey   = entry.apiKeyEnv
        ? (readSecret(entry.apiKeyEnv) || process.env[entry.apiKeyEnv] || null)
        : null;
      let instance = null;

      if (typeof ConnectorClass === "function" && ConnectorClass.prototype && typeof ConnectorClass.prototype.run === "function") {
        instance = new ConnectorClass({
          name:    entry.name,
          version: entry.version,
          apiKey,
          enabled: entry.enabled,
        });
      } else {
        instance = new LegacyConnectorAdapter({
          name:    entry.name,
          version: entry.version,
          apiKey,
          enabled: entry.enabled,
        }, mod);
      }

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
