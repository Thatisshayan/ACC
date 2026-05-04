import { useState, useEffect } from "react";
import { getAuditTrail } from "../api.js";

const row = { borderBottom: "1px solid #222", padding: "10px 0", fontSize: 13 };
const col  = { color: "#aaa", minWidth: 100 };

export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditTrail().then(d => { setEntries(d || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#aaa" }}>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Audit Trail</h1>
      {entries.length === 0 && <p style={{ color: "#666" }}>No audit entries yet.</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 11, color: "#555", borderBottom: "1px solid #333" }}>
            <th style={{ padding: "8px 0" }}>#</th>
            <th>Timestamp</th>
            <th>Node</th>
            <th>Agent</th>
            <th>Role</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map(e => (
            <tr key={e.id} style={row}>
              <td style={{ color: "#555", paddingRight: 12 }}>{e.id}</td>
              <td style={col}>{new Date(e.timestamp).toLocaleTimeString()}</td>
              <td style={{ color: "#e5e5e5" }}>{e.nodeId || "—"}</td>
              <td style={col}>{e.agentType}</td>
              <td style={col}>{e.actorRole}</td>
              <td style={{ color: e.status === "completed" ? "#86efac" : e.status === "failed" ? "#f87171" : "#fbbf24" }}>
                {e.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
