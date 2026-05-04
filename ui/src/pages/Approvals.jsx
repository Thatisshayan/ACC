import { useState, useEffect } from "react";
import { listSnapshots, approveSnapshot, rejectSnapshot } from "../api.js";

const card  = { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 20, marginBottom: 12 };
const btn   = (color) => ({ background: color, color: "#fff", border: "none", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginRight: 8 });
const badge = { display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#7f1d1d", color: "#fca5a5" };

export default function Approvals() {
  const [snaps, setSnaps]   = useState([]);
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);

  const load = () => listSnapshots().then(d => { setSnaps(d.snapshots || []); setLoading(false); }).catch(() => setLoading(false));

  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, []);

  async function handleApprove(id) {
    setStatus(s => ({ ...s, [id]: "approving…" }));
    try {
      await approveSnapshot(id);
      setStatus(s => ({ ...s, [id]: "✅ Approved" }));
      load();
    } catch (e) { setStatus(s => ({ ...s, [id]: "Error: " + e.message })); }
  }

  async function handleReject(id) {
    if (!confirm("Reject and delete this snapshot?")) return;
    setStatus(s => ({ ...s, [id]: "rejecting…" }));
    try {
      await rejectSnapshot(id);
      setStatus(s => ({ ...s, [id]: "❌ Rejected" }));
      load();
    } catch (e) { setStatus(s => ({ ...s, [id]: "Error: " + e.message })); }
  }

  if (loading) return <p style={{ color: "#aaa" }}>Loading…</p>;

  const pending = snaps.filter(s => s.pendingApproval);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Pending Approvals</h1>
      {pending.length === 0 && <p style={{ color: "#666" }}>No pending approvals.</p>}
      {pending.map(s => (
        <div key={s.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <span style={badge}>PENDING</span>
              <span style={{ marginLeft: 10, fontSize: 13, color: "#aaa" }}>{s.id}</span>
            </div>
            <span style={{ fontSize: 11, color: "#555" }}>{new Date(s.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 13, color: "#ccc", marginBottom: 8 }}>
            <b>Node:</b> {s.meta?.nodeId || "—"} &nbsp;|&nbsp; <b>Role:</b> {s.meta?.createdBy || "—"} &nbsp;|&nbsp; <b>Task:</b> {s.meta?.taskId || "—"}
          </div>
          {s.outputSummary && (
            <pre style={{ background: "#111", padding: 10, borderRadius: 6, fontSize: 11, color: "#86efac", overflow: "auto", maxHeight: 120, marginBottom: 12 }}>
              {s.outputSummary}
            </pre>
          )}
          <div>
            <button style={btn("#166534")} onClick={() => handleApprove(s.id)}>✅ Approve</button>
            <button style={btn("#7f1d1d")} onClick={() => handleReject(s.id)}>❌ Reject</button>
            {status[s.id] && <span style={{ fontSize: 12, color: "#aaa" }}>{status[s.id]}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
