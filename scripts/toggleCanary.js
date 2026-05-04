// scripts/toggleCanary.js
// Toggle sandbox mode for a marketplace connector.
// Usage: node scripts/toggleCanary.js enable|disable connectorName
// Example: node scripts/toggleCanary.js enable kijiji

const fs   = require("fs");
const path = require("path");

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node scripts/toggleCanary.js enable|disable connectorName");
  console.error("  enable  → sets sandbox: false (LIVE mode)");
  console.error("  disable → sets sandbox: true  (sandbox mode)");
  process.exit(1);
}

const [action, name] = args;
if (!["enable", "disable"].includes(action)) {
  console.error("Action must be 'enable' or 'disable'.");
  process.exit(1);
}

const MANIFEST = path.join(__dirname, "../cloud/connectors/marketplace/manifest.marketplace.json");

if (!fs.existsSync(MANIFEST)) {
  console.error("manifest.marketplace.json not found at:", MANIFEST);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
let found = false;

for (const c of manifest.connectors) {
  if (c.name === name) {
    found = true;
    c.sandbox = (action === "disable"); // enable → sandbox:false (live), disable → sandbox:true
    const mode = c.sandbox ? "SANDBOX" : "⚠️  LIVE";
    console.log(`[toggleCanary] ${name} → sandbox: ${c.sandbox} (${mode})`);
  }
}

if (!found) {
  console.error(`Connector "${name}" not found in manifest. Available:`, manifest.connectors.map(c => c.name).join(", "));
  process.exit(1);
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log("[toggleCanary] manifest.marketplace.json updated.");

if (action === "enable") {
  console.log("⚠️  WARNING: Live mode enabled for", name);
  console.log("   Ensure vault keys, HMAC secret, rate limits, and Telegram approvals are configured.");
  console.log("   Monitor the first 3 posts manually before scaling.");
}
