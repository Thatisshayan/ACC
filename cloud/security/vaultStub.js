// cloud/security/vaultStub.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VAULT_DIR = path.join(process.cwd(), "cloud", "security", ".vault");
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

const KEY_FILE = path.join(VAULT_DIR, ".vault_key");
let MASTER_KEY_ENV = process.env.ACC_VAULT_MASTER_KEY || null;

if (!MASTER_KEY_ENV) {
  if (process.env.NODE_ENV === 'production') {
    // validateEnv.js should have already caught this and exited — this is a final hard stop.
    throw new Error('[vault] ACC_VAULT_MASTER_KEY is required in production. Refusing to start without it.');
  }
  
  if (fs.existsSync(KEY_FILE)) {
    try {
      MASTER_KEY_ENV = fs.readFileSync(KEY_FILE, "utf8").trim();
      fs.chmodSync(KEY_FILE, 0o600);
    } catch (e) {
      console.error("[vaultStub] Failed to read local .vault_key:", e.message);
    }
  }

  if (!MASTER_KEY_ENV) {
    console.warn("[vaultStub] ACC_VAULT_MASTER_KEY not set. Generating local dev-only encryption key in .vault_key");
    MASTER_KEY_ENV = crypto.randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(KEY_FILE, MASTER_KEY_ENV, { encoding: "utf8", mode: 0o600 });
      fs.chmodSync(KEY_FILE, 0o600); // enforce even if the file already existed with looser perms
    } catch (e) {
      console.error("[vaultStub] Failed to save local .vault_key:", e.message);
    }
  }
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
  try {
    const key = deriveKey(MASTER_KEY_ENV);
    const buf = Buffer.from(raw, "base64");
    if (buf.length < 28) {
      // Gracefully handle unencrypted legacy format on read
      try { return JSON.parse(raw).value; } catch { return fallback; }
    }
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const encrypted = buf.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(decrypted).value ?? fallback;
  } catch (e) {
    // Gracefully fallback to legacy parsing if decryption fails (e.g. key transitioned or legacy unencrypted on disk)
    try { return JSON.parse(raw).value; } catch { return fallback; }
  }
}

function listSecrets() {
  return fs.readdirSync(VAULT_DIR)
    .filter(f => f.endsWith(".vault"))
    .map(f => f.replace(".vault", ""));
}

module.exports = { writeSecret, readSecret, listSecrets };
