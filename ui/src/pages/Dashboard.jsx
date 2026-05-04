import { useState, useEffect } from "react";
import { getDashboard, getAdminSystem } from "../api.js";

const card = { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 20, marginBottom: 16 };
const badge = (ok) => ({ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, background: ok ? "#166534" : "#7f1d1d", color: ok ? "#86efac" : "#fca5a5" });

export default function Dashboard() {
  const [data,   setData]   = useState(null);
  const [system, setSystem] = useState(null);
  const [err,    setErr]    = useState(null);

  useEffect(() => {
    getDashboard().then(setData).catch(e => setErr(e.message));
    getAdminSystem().then(setSystem).catch(() => {});
    const id = setInterval(() => {
      getDashboard().then(setData).catch(() => {});
      getAdminSystem().then(setSystem).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  if (err)  return <p style={{ color: "#f87171" }}>Error: {err}</p>;
  if (!data) return <p style={{ color: "#aaa" }}>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      <div style={card}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#aaa" }}>System</h2>
        {system && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Stat label="Active Bot"     value={system.activeBot    || "none"} />
            <Stat label="Worker"         value={system.workerStatus || "?"} ok={system.workerStatus === "healthy"} />
            <Stat label="Queue"          value={system.queueLength ?? 0} />
            <Stat label="Claude"         value={system.claudeStatus} ok={system.claudeStatus === "configured"} />
            <Stat label="DeepSeek"       value={system.deepseekStatus} ok={system.deepseekStatus === "configured"} />
            <Stat label="OpenAI"         value={system.openaiStatus} ok={system.openaiStatus === "configured"} />
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#aaa" }}>Connectors</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.connectors.map(c => <span key={c} style={badge(true)}>{c}</span>)}
          {data.marketplaces.map(c => <span key={c} style={{ ...badge(false), background: "#713f12", color: "#fde68a" }}>{c} (mkt)</span>)}
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#aaa" }}>Pending Approvals</h2>
        <p style={{ fontSize: 32, fontWeight: 700, color: data.pendingSnapshots > 0 ? "#f87171" : "#86efac" }}>
          {data.pendingSnapshots}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, ok }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>
      <span style={badge(ok !== undefined ? ok : true)}>{String(value)}</span>
    </div>
  );
}
