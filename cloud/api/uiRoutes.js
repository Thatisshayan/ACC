// cloud/api/uiRoutes.js
const express      = require("express");
const { listSnapshots, getSnapshot, approveSnapshot, deleteSnapshot } = require("../security/ephemeralSnapshots.js");
const { listConnectors }        = require("../connectors/registry.js");
const { listMarketplaceAdapters } = require("../connectors/marketplace/registry.js");
const { listApprovals }         = require("../security/signedApprovals.js");
const { signApproval }          = require("../security/signedApprovals.js");
const { listSecrets }           = require("../security/vaultStub.js");
const { saveToNotion }          = require("../memory/notionStorage.js");
const { log }                   = require("../utils/logger.js");
const { getAuditTrail }         = require("../utils/auditLog.js");
const { requireApprovalFreshness } = require("../middleware/auth.js");

const router = express.Router();

// ── Dashboard summary ─────────────────────────────────────────────────────────
router.get("/dashboard", (req, res) => {
  try {
    const connectors   = listConnectors();
    const marketplaces = listMarketplaceAdapters();
    const snapshots    = listSnapshots();
    const pending      = snapshots.filter(s => s.pendingApproval).length;
    return res.json({ success: true, connectors, marketplaces, pendingSnapshots: pending, totalSnapshots: snapshots.length });
  } catch (e) {
    log("[uiRoutes] dashboard error:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── Snapshots ─────────────────────────────────────────────────────────────────
router.get("/snapshots", (req, res) => {
  const snaps = listSnapshots().map(s => ({
    id:            s.id,
    meta:          s.meta,
    createdAt:     s.createdAt,
    expiresAt:     s.expiresAt,
    pendingApproval: s.pendingApproval,
    outputSummary: s.data?.outputSummary || null, // preview only
  }));
  return res.json({ success: true, snapshots: snaps });
});

router.get("/snapshot/:id", (req, res) => {
  const snap = getSnapshot(req.params.id);
  if (!snap) return res.status(404).json({ success: false, error: "Snapshot not found." });
  // Return preview — never return fullOutput via API
  return res.json({
    success: true,
    snapshot: {
      id:            snap.id,
      meta:          snap.meta,
      createdAt:     snap.createdAt,
      expiresAt:     snap.expiresAt,
      pendingApproval: snap.pendingApproval,
      approvedAt:    snap.approvedAt,
      outputSummary: snap.data?.outputSummary || null,
    },
  });
});

router.post("/snapshot/:id/approve", requireApprovalFreshness, async (req, res) => {
  const approver = req.auth?.subject || "unknown";
  const role = req.auth?.role;
  if (role !== "operator" && role !== "admin") return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const snap = getSnapshot(req.params.id);
    if (!snap) return res.status(404).json({ success: false, error: "Snapshot not found." });
    approveSnapshot(req.params.id);
    // Persist to Notion
    await saveToNotion(snap.data).catch(() => {});
    const signed = signApproval({ snapshotId: req.params.id, approver, timestamp: Date.now() });
    return res.json({ success: true, signed });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/snapshot/:id/reject", requireApprovalFreshness, (req, res) => {
  const approver = req.auth?.subject || "unknown";
  const role = req.auth?.role;
  if (role !== "operator" && role !== "admin") return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    deleteSnapshot(req.params.id);
    return res.json({ success: true, approver, message: "Snapshot rejected and deleted." });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── Approvals (signed records) ────────────────────────────────────────────────
router.get("/approvals", (req, res) => {
  return res.json({ success: true, approvals: listApprovals() });
});

// ── Audit trail ───────────────────────────────────────────────────────────────
router.get("/audit", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  return res.json({ success: true, entries: getAuditTrail(limit) });
});

// ── Secrets list (Admin only — names only, never values) ──────────────────────
router.get("/secrets", (req, res) => {
  return res.json({ success: true, secrets: listSecrets() });
});

module.exports = router;
