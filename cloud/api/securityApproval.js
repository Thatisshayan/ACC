// cloud/api/securityApproval.js
const express       = require("express");
const { getSnapshot, approveSnapshot, deleteSnapshot, listPendingSnapshots } = require("../security/ephemeralSnapshots.js");
const { saveToNotion }  = require("../memory/notionStorage.js");
const { signApproval }  = require("../security/signedApprovals.js");
const { log }           = require("../utils/logger.js");

const router = express.Router();

// ── List pending snapshots ────────────────────────────────────────────────────
router.get("/snapshots/pending", (req, res) => {
  const pending = listPendingSnapshots().map(s => ({
    id:          s.id,
    meta:        s.meta,
    createdAt:   s.createdAt,
    expiresAt:   s.expiresAt,
    outputSummary: s.data?.outputSummary || null, // preview only, not full output
  }));
  res.json(pending);
});

// ── Approve or reject a snapshot ─────────────────────────────────────────────
router.post("/snapshot/approve", async (req, res) => {
  const { snapshotId, approve, approver } = req.body || {};

  if (!snapshotId || typeof approve !== "boolean") {
    return res.status(400).json({ success: false, error: "snapshotId (string) and approve (boolean) are required." });
  }

  // Only Shayan can approve
  if (approver !== "Shayan") {
    return res.status(403).json({ success: false, error: "Only Shayan can approve snapshots." });
  }

  const snap = getSnapshot(snapshotId);
  if (!snap) {
    return res.status(404).json({ success: false, error: "Snapshot not found or already processed." });
  }

  if (!approve) {
    deleteSnapshot(snapshotId);
    log("[securityApproval] Snapshot rejected by", approver, snapshotId);
    return res.json({ success: true, message: "Snapshot rejected and deleted." });
  }

  try {
    // Persist to Notion (LTM) only after approval
    await saveToNotion(snap.data);
    approveSnapshot(snapshotId);

    // Create signed tamper-evident approval record
    const signed = signApproval({ snapshotId, approver, timestamp: Date.now(), meta: snap.meta || {} });

    log("[securityApproval] Snapshot approved and saved by", approver, snapshotId, "| approvalId:", signed.id);
    return res.json({ success: true, message: "Snapshot approved and persisted.", signed });
  } catch (e) {
    log("[securityApproval] Save failed:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
