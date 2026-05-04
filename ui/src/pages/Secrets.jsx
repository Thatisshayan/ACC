import { useState, useEffect } from "react";
import { listSecrets } from "../api.js";

const card  = { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 20, marginBottom: 16 };
const badge = { display: "inline-block", padding: "3px 12px", borderRadius: 10, fontSize: 12, background: "#1c3d2a", color: "#86efac", marginRight: 8, marginBottom: 8 };

export default function Secrets() {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSecrets().then(d => { setSecrets(d.secrets || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#aaa" }}>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Vault Secrets</h1>
      <p style={{ color: "#555", fontSize: 13, marginBottom: 24 }}>Secret names only — values are never shown in the UI.</p>

      <div style={card}>
        {secrets.length === 0
          ? <p style={{ color: "#666" }}>No secrets stored in vault yet.</p>
          : secrets.map(s => <span key={s} style={badge}>🔑 {s}</span>)
        }
      </div>

      <div style={{ ...card, borderColor: "#3b1f1f" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#f87171", marginBottom: 8 }}>How to add a secret</h2>
        <pre style={{ fontSize: 12, color: "#aaa", background: "#111", padding: 12, borderRadius: 6 }}>
{`// Run once in Node.js:
const { writeSecret } = require('./cloud/security/vaultStub');
writeSecret('NOTION_API_KEY', 'secret-value-here');`}
        </pre>
      </div>
    </div>
  );
}
