// cloud/security/signedApprovals.js
const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");

const STORE_DIR = path.join(__dirname, ".approvals");
if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

const HMAC_SECRET = process.env.ACC_APPROVAL_HMAC_SECRET || null;
if (!HMAC_SECRET) console.warn("[signedApprovals] ACC_APPROVAL_HMAC_SECRET not set. Approvals will be unsigned.");

function signApproval(record) {
  const payload = JSON.stringify(record);
  const id      = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const file    = path.join(STORE_DIR, `${id}.json`);

  if (!HMAC_SECRET) {
    fs.writeFileSync(file, payload, "utf8");
    return { id, signature: null, record };
  }

  const signature = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
  fs.writeFileSync(file, JSON.stringify({ record, signature }), "utf8");
  return { id, signature, record };
}

function verifyApprovalFile(id) {
  const file = path.join(STORE_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return false;
  const raw = fs.readFileSync(file, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!HMAC_SECRET) return true;
    const payload  = JSON.stringify(parsed.record);
    const expected = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
    return expected === parsed.signature;
  } catch {
    return false;
  }
}

function listApprovals() {
  return fs.readdirSync(STORE_DIR).filter(f => f.endsWith(".json"));
}

module.exports = { signApproval, verifyApprovalFile, listApprovals };
