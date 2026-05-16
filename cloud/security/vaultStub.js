// cloud/security/vaultStub.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VAULT_DIR = path.join(process.cwd(), "cloud", "security", ".vault");
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

const MASTER_KEY_ENV = process.env.ACC_VAULT_MASTER_KEY || null;
if (!MASTER_KEY_ENV) {
  console.warn("[vaultStub] WARNING: ACC_VAULT_MASTER_KEY not set. Vault will operate in unencrypted mode.");
}

function deriveKey(masterKey) {
  return crypto.createHash("sha256").update(masterKey).digest();
}

function _vaultFile(name) {
  return path.join(VAULT_DIR, `${name}.vault`);
}

function writeSecret(name, value) {
  if (!name) throw new Error("secret name required");
  const file = _vaultFile(name);
  if (!MASTER_KEY_ENV) {
    fs.writeFileSync(file, JSON.stringify({ value }), { encoding: "utf8" });
    return true;
  }
  const key = deriveKey(MASTER_KEY_ENV);
  const iv = crypto.randomBytes(12); // 12 bytes recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify({ value });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
  fs.writeFileSync(file, payload, { encoding: "utf8" });
  return true;
}

function readSecret(name, fallback = null) {
  const file = _vaultFile(name);
  if (!fs.existsSync(file)) return fallback;
  const raw = fs.readFileSync(file, "utf8");
  if (!MASTER_KEY_ENV) {
    try { return JSON.parse(raw).value; } catch { return fallback; }
  }
  try {
    const key = deriveKey(MASTER_KEY_ENV);
    const buf = Buffer.from(raw, "base64");
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const encrypted = buf.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(decrypted).value ?? fallback;
  } catch (e) {
    console.warn("[vaultStub] Failed to decrypt secret:", e.message);
    return fallback;
  }
}

function listSecrets() {
  return fs.readdirSync(VAULT_DIR)
    .filter(f => f.endsWith(".vault"))
    .map(f => f.replace(".vault", ""));
}

module.exports = { writeSecret, readSecret, listSecrets };
