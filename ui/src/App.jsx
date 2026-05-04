import { useState } from "react";
import Dashboard  from "./pages/Dashboard.jsx";
import Approvals  from "./pages/Approvals.jsx";
import Audit      from "./pages/Audit.jsx";
import Secrets    from "./pages/Secrets.jsx";

const NAV = ["Dashboard", "Approvals", "Audit", "Secrets"];

const styles = {
  layout:  { display: "flex", minHeight: "100vh" },
  sidebar: { width: 180, background: "#1a1a1a", padding: "24px 0", display: "flex", flexDirection: "column", gap: 4, borderRight: "1px solid #2a2a2a" },
  navBtn:  (active) => ({ background: active ? "#2563eb" : "transparent", color: active ? "#fff" : "#aaa", border: "none", padding: "10px 24px", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: active ? 600 : 400 }),
  main:    { flex: 1, padding: 32, overflowY: "auto" },
  title:   { fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: 2, padding: "0 24px 16px", textTransform: "uppercase" },
};

export default function App() {
  const [page, setPage] = useState("Dashboard");

  return (
    <div style={styles.layout}>
      <div style={styles.sidebar}>
        <div style={styles.title}>ACC v2</div>
        {NAV.map(n => (
          <button key={n} style={styles.navBtn(page === n)} onClick={() => setPage(n)}>{n}</button>
        ))}
      </div>
      <div style={styles.main}>
        {page === "Dashboard" && <Dashboard />}
        {page === "Approvals" && <Approvals />}
        {page === "Audit"     && <Audit />}
        {page === "Secrets"   && <Secrets />}
      </div>
    </div>
  );
}
