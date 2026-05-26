// ui/src/pages/Admin.jsx
import React, { useState, useEffect, useRef } from 'react';
import { getAdminSystem, getAdminUsers, getAdminLogs, getAdminConnectors, getAdminTasks, getAuditTrail } from '../api.js';

const TABS = [
  { id: 'health',     label: 'System Health', icon: '🖥️' },
  { id: 'logs',       label: 'Logs',          icon: '📜' },
  { id: 'users',      label: 'Users',         icon: '👥' },
  { id: 'tasks',      label: 'Task Queue',    icon: '📋' },
  { id: 'connectors', label: 'Connectors',    icon: '🔌' },
  { id: 'audit',      label: 'Audit Trail',   icon: '🔍' },
];

function Pill({ ok, label }) {
  const cls = ok
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
    : 'bg-zinc-500/15 text-zinc-500 border-zinc-500/20';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border ${cls}`}>{label}</span>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-medium text-zinc-200 ${mono ? 'font-mono' : ''}`}>{String(value ?? '—')}</span>
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, sub }) {
  return (
    <div className="px-5 py-3 border-b border-white/[0.06]">
      <div className="text-sm font-medium text-white">{title}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── System Health tab ─────────────────────────────────────────────────────────

function HealthTab() {
  const [data, setData] = useState(null);
  const [err, setErr]   = useState(null);

  useEffect(() => {
    getAdminSystem()
      .then(setData)
      .catch(e => setErr(e?.response?.data?.error || e.message));
    const id = setInterval(() => getAdminSystem().then(setData).catch(() => {}), 10000);
    return () => clearInterval(id);
  }, []);

  if (err)  return <div className="p-6 text-red-400 text-sm">{err}</div>;
  if (!data) return <div className="p-6 text-zinc-500 text-sm">Loading…</div>;

  const providers = [
    { name: 'Claude',   status: data.claudeStatus },
    { name: 'OpenAI',   status: data.openaiStatus },
    { name: 'Whisper',  status: data.whisperStatus },
    { name: 'DeepSeek', status: data.deepseekStatus },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Bot status',   value: data.botStatus,    color: data.botStatus === 'active' ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Queue length', value: data.queueLength ?? 0, color: 'text-white' },
          { label: 'Total tasks',  value: data.totalTasks ?? 0,  color: 'text-white' },
          { label: 'Worker',       value: data.workerStatus?.status ?? 'unknown', color: 'text-amber-400' },
        ].map(m => (
          <div key={m.label} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{m.label}</div>
            <div className={`mt-2 text-2xl font-semibold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="API providers" sub="Configured = key present in env" />
          {providers.map(p => (
            <Row key={p.name} label={p.name} value={p.status} />
          ))}
        </Card>

        <Card>
          <CardHeader title="Bot lock" sub="File-based mutex preventing duplicate instances" />
          <Row label="Active bot"  value={data.botLock?.activeBot} />
          <Row label="PID"         value={data.botLock?.pid} mono />
          <Row label="Last ping"   value={data.botLock?.lastPing ? new Date(data.botLock.lastPing).toLocaleTimeString() : '—'} />
          <Row label="Healthy"     value={data.botLock?.healthy ? 'yes' : 'no'} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Worker detail" />
        <Row label="Status"  value={data.workerStatus?.status} />
        <Row label="Running" value={data.workerStatus?.running} />
        <Row label="Last updated" value={data.timestamp ? new Date(data.timestamp).toLocaleString() : '—'} />
      </Card>
    </div>
  );
}

// ── Logs tab ──────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs]     = useState([]);
  const [filter, setFilter] = useState('');
  const [level, setLevel]   = useState('all');
  const [err, setErr]       = useState(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  function reload() {
    setLoading(true);
    getAdminLogs(300)
      .then(data => { setLogs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(e => { setErr(e?.response?.data?.error || e.message); setLoading(false); });
  }

  useEffect(() => { reload(); const id = setInterval(reload, 8000); return () => clearInterval(id); }, []);
  useEffect(() => { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const levelColor = { error: 'text-red-400', warn: 'text-amber-400', info: 'text-zinc-300', debug: 'text-zinc-600' };

  const visible = logs.filter(l => {
    if (level !== 'all' && (l.level || 'info') !== level) return false;
    if (filter && !JSON.stringify(l).toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter logs…"
          className="flex-1 min-w-[200px] rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
        />
        <select
          value={level}
          onChange={e => setLevel(e.target.value)}
          className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-zinc-200 outline-none"
        >
          <option value="all">All levels</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
        <button onClick={reload} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.08]">
          Refresh
        </button>
        <span className="text-xs text-zinc-600">{visible.length} entries</span>
      </div>

      {err && <div className="text-red-400 text-sm">{err}</div>}

      <div className="rounded-2xl border border-white/[0.06] bg-black/40 overflow-auto max-h-[60vh] font-mono text-[11px] leading-relaxed">
        {loading && <div className="p-4 text-zinc-600">Loading logs…</div>}
        {!loading && visible.length === 0 && <div className="p-4 text-zinc-600">No log entries match.</div>}
        {visible.map((l, i) => {
          const lvl  = l.level || 'info';
          const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : '';
          const msg  = l.message || l.msg || JSON.stringify(l);
          return (
            <div key={i} className="flex gap-3 px-4 py-1.5 border-b border-white/[0.03] hover:bg-white/[0.02]">
              <span className="text-zinc-600 shrink-0 w-20">{time}</span>
              <span className={`shrink-0 w-12 uppercase text-[10px] font-bold ${levelColor[lvl] || 'text-zinc-500'}`}>{lvl}</span>
              <span className="text-zinc-300 break-all">{msg}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => {
    getAdminUsers()
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(e => setErr(e?.response?.data?.error || e.message));
  }, []);

  const visible = users.filter(u => {
    if (!search) return true;
    return JSON.stringify(u).toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-4 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search users…"
          className="flex-1 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
        />
        <span className="text-xs text-zinc-600">{visible.length} users</span>
      </div>
      {err && <div className="text-red-400 text-sm">{err}</div>}
      <Card>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-5 py-2.5 border-b border-white/[0.06] text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          <span>User</span><span>Language</span><span>Role</span><span>Status</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {visible.length === 0 && <div className="px-5 py-8 text-sm text-zinc-600">No users found.</div>}
          {visible.map((u, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-5 py-3 hover:bg-white/[0.02]">
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{u.name || u.firstName || u.first_name || 'Unknown'}</div>
                <div className="text-xs text-zinc-600 font-mono">{String(u.id || u.userId || '').slice(0, 12)}</div>
              </div>
              <span className="text-xs text-zinc-400 self-center">{u.language || 'en'}</span>
              <span className="text-xs text-zinc-400 self-center capitalize">{u.role || 'user'}</span>
              <span className="self-center">
                <Pill ok={!u.banned} label={u.banned ? 'banned' : 'active'} />
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Task Queue tab ────────────────────────────────────────────────────────────

function TasksTab() {
  const [tasks, setTasks] = useState([]);
  const [err, setErr]     = useState(null);

  useEffect(() => {
    getAdminTasks()
      .then(data => setTasks(Array.isArray(data) ? data : []))
      .catch(e => setErr(e?.response?.data?.error || e.message));
    const id = setInterval(() => getAdminTasks().then(data => setTasks(Array.isArray(data) ? data : [])).catch(() => {}), 8000);
    return () => clearInterval(id);
  }, []);

  const statusColor = { pending: 'text-amber-400', done: 'text-emerald-400', failed: 'text-red-400', running: 'text-sky-400' };

  return (
    <div className="p-4 sm:p-6 space-y-3">
      {err && <div className="text-red-400 text-sm">{err}</div>}
      <div className="text-xs text-zinc-600">{tasks.length} tasks in queue</div>
      <Card>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-5 py-2.5 border-b border-white/[0.06] text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          <span>Task</span><span>Agent</span><span>Status</span><span>Created</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {tasks.length === 0 && <div className="px-5 py-8 text-sm text-zinc-600">Queue is empty.</div>}
          {tasks.map((t, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-5 py-3 hover:bg-white/[0.02]">
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{t.taskId?.slice(0, 10) || '—'}</div>
                <div className="text-xs text-zinc-600">{t.role || t.priority || ''}</div>
              </div>
              <span className="text-xs text-zinc-400 self-center">{t.agentType || '—'}</span>
              <span className={`text-xs self-center font-medium ${statusColor[t.status] || 'text-zinc-400'}`}>{t.status}</span>
              <span className="text-xs text-zinc-600 self-center">
                {t.createdAt ? new Date(t.createdAt).toLocaleTimeString() : '—'}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Connectors tab ────────────────────────────────────────────────────────────

function ConnectorsTab() {
  const [connectors, setConnectors] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getAdminConnectors()
      .then(data => setConnectors(Array.isArray(data) ? data : Object.entries(data || {}).map(([id, v]) => ({ id, ...v }))))
      .catch(e => setErr(e?.response?.data?.error || e.message));
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-3">
      {err && <div className="text-red-400 text-sm">{err}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {connectors.length === 0 && !err && (
          <div className="col-span-3 text-sm text-zinc-600 py-8 text-center">No connectors registered.</div>
        )}
        {connectors.map((c, i) => {
          const ok = c.status === 'connected' || c.enabled === true;
          return (
            <div key={i} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-white capitalize">{c.id || c.name || 'Connector'}</span>
                <Pill ok={ok} label={c.status || (ok ? 'connected' : 'unknown')} />
              </div>
              {c.note && <div className="text-xs text-zinc-600 mt-1">{c.note}</div>}
              {c.error && <div className="text-xs text-red-500 mt-1">{c.error}</div>}
              {c.endpoints && (
                <div className="mt-2 text-[10px] text-zinc-600 font-mono">
                  {c.endpoints.length} endpoint{c.endpoints.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Audit trail tab ───────────────────────────────────────────────────────────

function AuditTab() {
  const [trail, setTrail] = useState([]);
  const [err, setErr]     = useState(null);

  useEffect(() => {
    getAuditTrail()
      .then(data => setTrail(Array.isArray(data) ? data : []))
      .catch(e => setErr(e?.response?.data?.error || e.message));
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-3">
      {err && <div className="text-red-400 text-sm">{err}</div>}
      <div className="text-xs text-zinc-600">{trail.length} audit entries</div>
      <Card>
        <div className="grid grid-cols-[1fr_1fr_2fr_1fr] gap-3 px-5 py-2.5 border-b border-white/[0.06] text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          <span>Time</span><span>Actor</span><span>Action</span><span>Result</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {trail.length === 0 && <div className="px-5 py-8 text-sm text-zinc-600">No audit events recorded.</div>}
          {trail.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2fr_1fr] gap-3 px-5 py-3 hover:bg-white/[0.02]">
              <span className="text-[11px] text-zinc-600 font-mono">
                {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '—'}
              </span>
              <span className="text-xs text-zinc-400">{e.actor || e.agent || '—'}</span>
              <span className="text-xs text-zinc-200">{e.action || e.event || JSON.stringify(e)}</span>
              <span className={`text-xs ${e.result === 'ok' || e.result === 'approved' ? 'text-emerald-400' : e.result === 'rejected' ? 'text-red-400' : 'text-zinc-500'}`}>
                {e.result || '—'}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState('health');

  const content = {
    health:     <HealthTab />,
    logs:       <LogsTab />,
    users:      <UsersTab />,
    tasks:      <TasksTab />,
    connectors: <ConnectorsTab />,
    audit:      <AuditTab />,
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 mb-1">System</div>
        <h2 className="text-xl font-semibold text-white">Admin</h2>
        <p className="text-xs text-zinc-500 mt-1">Observe and manage all backend resources from one place.</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl border border-white/[0.06] bg-black/20 p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-white/[0.10] text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] min-h-[400px]">
        {content[tab]}
      </div>
    </div>
  );
}
