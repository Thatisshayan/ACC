import React, { useState, useEffect, useRef, useCallback } from 'react';
import OnboardingChecklist from './components/OnboardingChecklist.jsx';
import {
  LayoutDashboard, CheckSquare, ShieldCheck, MessageSquare, Mic,
  Bot, Plug, Search, Shield, Settings, ChevronLeft, ChevronRight,
  Zap, Clock, CheckCircle2, XCircle, AlertTriangle, Activity,
  Terminal, Send, ArrowRight, RefreshCw, Wifi, WifiOff,
  TrendingUp, Users, Layers, Bell, Circle, Play, MoreHorizontal,
  GitMerge, Repeat, Mail,
} from 'lucide-react';
import {
  getTaskbusStats, getTaskbusTasks, getTaskbusIntegrations,
  listAgents, createTask, listWorkflows, runWorkflow,
  getAlphonsoBridgeStatus, listAlphonsoBridgePackets,
} from './api.js';
import api from './api.js';
import { getRuntimeApiBaseUrl } from './lib/api.js';
import MessengerPage  from './pages/Messenger.jsx';
import AssistantPage  from './pages/Assistant.jsx';
import AdminPage      from './pages/Admin.jsx';
import AuditPage      from './pages/Audit.jsx';
import SynapsePage    from './pages/Synapse.jsx';
import WorkflowsPage  from './pages/Workflows.jsx';
import AutonomyPage   from './pages/Autonomy.jsx';

const IS_ELECTRON_FILE = typeof window !== 'undefined' && window.location?.protocol === 'file:';
const API = getRuntimeApiBaseUrl();

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useLivePulse(ms = 1800) {
  const [on, setOn] = useState(true);
  useEffect(() => { const id = setInterval(() => setOn(v => !v), ms); return () => clearInterval(id); }, [ms]);
  return on;
}

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const n = Number(target) || 0;
    if (n === prevRef.current) return;
    const start = prevRef.current;
    const diff  = n - start;
    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setVal(Math.round(start + diff * eased));
      if (t < 1) requestAnimationFrame(step);
      else prevRef.current = n;
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

function useElapsed() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = setInterval(() => setS(v => v + 1), 1000); return () => clearInterval(id); }, []);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DEFAULT_BACKEND = { status: 'Offline', detail: 'Checking…', lastCheckedAt: null };

function taskTime(value) {
  if (!value) return 'just now';
  try {
    const d = new Date(value);
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return 'just now'; }
}

const STATUS_STYLE = {
  done:             { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Done' },
  completed:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Done' },
  failed:           { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         label: 'Failed' },
  pending:          { color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     label: 'Pending' },
  in_progress:      { color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20',         label: 'Running' },
  waiting_approval: { color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20',   label: 'Review' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || { color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/20', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${s.bg} ${s.color}`}>
      {s.label}
    </span>
  );
}

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',    Icon: LayoutDashboard },
  { id: 'tasks',        label: 'Tasks',         Icon: CheckSquare },
  { id: 'approvals',    label: 'Approvals',     Icon: ShieldCheck },
  { id: 'messages',     label: 'Messages',      Icon: MessageSquare },
  { id: 'assistant',    label: 'Assistant',     Icon: Mic },
  { id: 'synapse',      label: 'Synapse',        Icon: Zap },
  { id: 'workflows',    label: 'Workflows',      Icon: GitMerge },
  { id: 'autonomy',     label: 'Autonomy',       Icon: Repeat },
  { id: 'agents',       label: 'Agents',        Icon: Bot },
  { id: 'integrations', label: 'Integrations',  Icon: Plug },
  { id: 'audit',        label: 'Audit',         Icon: Search },
  { id: 'admin',        label: 'Admin',         Icon: Shield },
  { id: 'settings',     label: 'Settings',      Icon: Settings },
];

const MOBILE_NAV = [
  { id: 'dashboard',  label: 'Home',    Icon: LayoutDashboard },
  { id: 'messages',   label: 'Chat',    Icon: MessageSquare },
  { id: 'assistant',  label: 'Assist',  Icon: Mic },
  { id: 'approvals',  label: 'Review',  Icon: ShieldCheck },
  { id: 'settings',   label: 'More',    Icon: Settings },
];

const PAGE_PATHS = new Set(['dashboard','tasks','approvals','messages','assistant','synapse','workflows','autonomy','agents','integrations','audit','admin','settings']);
function pathToPage(p) {
  const n = String(p||'').replace(/^\/app\b/, '').replace(/^\/+/,'').trim().toLowerCase();
  return PAGE_PATHS.has(n) ? n : 'dashboard';
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Card({ className = '', children, glow = false }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-[#0c0c18] ${glow ? 'border-[#1aff8c]/30 shadow-[0_0_24px_rgba(26,255,140,0.06)]' : ''} ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = '#1aff8c', trend }) {
  const animated = useCountUp(value);
  return (
    <Card className="p-5 group hover:border-white/[0.12] transition-colors duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + '12', border: `1px solid ${color}22` }}>
          <Icon size={16} style={{ color }} />
        </div>
        {trend !== undefined && (
          <span className={`text-[11px] font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white stat-number">{animated}</div>
      <div className="text-xs text-zinc-500 mt-0.5 font-medium">{label}</div>
      {sub && <div className="text-[11px] text-zinc-600 mt-1">{sub}</div>}
    </Card>
  );
}

function LiveDot({ size = 6 }) {
  const pulse = useLivePulse(1400);
  return (
    <span className="relative flex items-center justify-center" style={{ width: size + 4, height: size + 4 }}>
      <span className="absolute rounded-full animate-ping" style={{ width: size + 4, height: size + 4, background: '#1aff8c22' }} />
      <span className="rounded-full" style={{ width: size, height: size, background: '#1aff8c', opacity: pulse ? 1 : 0.5, transition: 'opacity 0.3s' }} />
    </span>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, collapsed, setCollapsed, pending, backend }) {
  const isOnline = backend.status === 'Online';
  const uptime = useElapsed();

  return (
    <aside className={`hidden md:flex flex-col flex-shrink-0 border-r border-white/[0.06] bg-[#07071a] transition-all duration-200 ${collapsed ? 'w-[60px]' : 'w-[220px]'}`}>
      {/* Logo */}
      <div className={`flex items-center border-b border-white/[0.06] ${collapsed ? 'justify-center px-3 py-4' : 'gap-3 px-4 py-4'}`}>
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#1aff8c]/10 border border-[#1aff8c]/25 flex items-center justify-center">
            <Terminal size={15} className="text-[#1aff8c]" />
          </div>
          {isOnline && <LiveDot size={5} />}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white tracking-wider leading-none">ACC</div>
            <div className="text-[9px] text-[#1aff8c]/50 tracking-[0.25em] uppercase mt-0.5">Command Center</div>
          </div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="text-zinc-600 hover:text-zinc-300 transition-colors ml-auto">
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-hide">
        {NAV.map(({ id, label, Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`w-full flex items-center transition-all duration-150 relative
                ${collapsed ? 'justify-center px-2 py-2.5 mx-1 rounded-xl' : 'gap-3 px-3 py-2.5 mx-2 rounded-xl'}
                ${active
                  ? 'bg-[#1aff8c]/10 text-[#1aff8c]'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              style={{ width: collapsed ? 44 : 'calc(100% - 16px)' }}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
              {!collapsed && id === 'approvals' && pending.length > 0 && (
                <span className="ml-auto bg-amber-500 text-black text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center blink">
                  {pending.length}
                </span>
              )}
              {collapsed && id === 'approvals' && pending.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-500 rounded-full blink" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Status footer */}
      <div className="p-3 border-t border-white/[0.06]">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button onClick={() => setCollapsed(false)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <ChevronRight size={14} />
            </button>
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#1aff8c]' : 'bg-zinc-600'}`} />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              {isOnline ? <Wifi size={11} className="text-[#1aff8c]" /> : <WifiOff size={11} className="text-zinc-500" />}
              <span className={`text-[11px] font-mono font-medium ${isOnline ? 'text-[#1aff8c]' : 'text-zinc-500'}`}>
                {backend.status.toUpperCase()}
              </span>
            </div>
            {isOnline && <div className="text-[10px] text-zinc-600 font-mono">UP {uptime}</div>}
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Gmail Connect Panel (Settings 5.1.2) ──────────────────────────────────────
function GmailConnectPanel() {
  const [creds, setCreds]     = useState([]);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);

  useEffect(() => {
    fetch(API + '/api/email/credentials?userId=default')
      .then(r => r.json())
      .then(d => setCreds(d.credentials || []))
      .catch(() => {});
  }, []);

  async function testAndSave() {
    if (!email || !password) { setMsg({ ok: false, text: 'Email and App Password required.' }); return; }
    setTesting(true);
    setMsg(null);
    try {
      const r = await fetch(API + '/api/email/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!d.success) { setMsg({ ok: false, text: d.error || 'Connection failed' }); return; }
      setSaving(true);
      const r2 = await fetch(API + '/api/email/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'default', email, password, provider: 'gmail' }),
      });
      const d2 = await r2.json();
      if (!d2.success) throw new Error(d2.error);
      setMsg({ ok: true, text: 'Gmail connected!' });
      setEmail(''); setPassword('');
      const r3 = await fetch(API + '/api/email/credentials?userId=default');
      const d3 = await r3.json();
      setCreds(d3.credentials || []);
    } catch(e) {
      setMsg({ ok: false, text: e.message });
    } finally { setTesting(false); setSaving(false); }
  }

  async function remove(id) {
    await fetch(API + `/api/email/credentials/${id}`, { method: 'DELETE' });
    setCreds(c => c.filter(x => x.id !== id));
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Mail size={14} className="text-zinc-400" />
        <div className="text-sm font-semibold text-white">Email Monitoring</div>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-600 ml-auto">Gmail / IMAP</span>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Connect Gmail to monitor your inbox. ACC polls for new emails and sends a Telegram summary.
        Use a <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" className="text-[#1aff8c]/70 underline">Google App Password</a> — not your regular password.
      </p>
      {creds.length > 0 && (
        <div className="mb-4 space-y-2">
          {creds.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${c.enabled ? 'bg-[#1aff8c]' : 'bg-zinc-600'}`} />
                <span className="text-xs text-zinc-300">{c.email}</span>
                <span className="text-[10px] text-zinc-600">{c.provider}</span>
              </div>
              <button onClick={() => remove(c.id)} className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors">remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com"
          className="rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="App password (16 chars)" type="password"
          className="rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
      </div>
      {msg && (
        <div className={`mb-3 text-xs px-3 py-2 rounded-xl border ${msg.ok ? 'border-[#1aff8c]/20 text-[#1aff8c] bg-[#1aff8c]/5' : 'border-red-500/20 text-red-400 bg-red-500/5'}`}>
          {msg.text}
        </div>
      )}
      <button onClick={testAndSave} disabled={testing || saving}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1aff8c]/25 bg-[#1aff8c]/8 text-xs font-semibold text-[#1aff8c] disabled:opacity-40 transition-all hover:bg-[#1aff8c]/15">
        {(testing || saving) ? 'Connecting…' : 'Test & Connect Gmail'}
      </button>
    </Card>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]       = useState(() => typeof window !== 'undefined' ? pathToPage(window.location.pathname) : 'dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [stats, setStats]     = useState({});
  const [tasks, setTasks]     = useState([]);
  const [integrations, setInt]= useState({});
  const [backend, setBackend] = useState(DEFAULT_BACKEND);
  const [agents, setAgents]   = useState([]);
  const [workflowCatalog, setWorkflowCatalog] = useState([]);
  const [approvalBusy, setApprovalBusy] = useState(new Set());
  const [approvalMsg, setApprovalMsg]   = useState({});
  const [activityLog, setActivityLog]   = useState([]);
  const [updateInfo, setUpdateInfo]     = useState(null);
  const [command, setCommand]           = useState('');
  const [cmdHistory, setCmdHistory]     = useState([]);

  async function fetchAll() {
    const [s, t, i, a, w] = await Promise.all([
      getTaskbusStats().catch(() => ({})),
      getTaskbusTasks().catch(() => ({ tasks: [] })),
      getTaskbusIntegrations().catch(() => ({})),
      listAgents().catch(() => ({ agents: [] })),
      listWorkflows().catch(() => ({ workflows: [] })),
    ]);
    setStats(s.stats || s || {});
    const newTasks = Array.isArray(t.tasks) ? t.tasks : Array.isArray(t) ? t : [];
    setTasks(prev => {
      if (prev.length > 0 && newTasks.length > prev.length) {
        const added = newTasks.slice(0, newTasks.length - prev.length);
        setActivityLog(log => [
          ...added.map(task => ({ id: task.id, text: task.title || task.id?.slice(0,16), agent: task.assigned_agent, at: new Date().toLocaleTimeString(), status: task.status })),
          ...log,
        ].slice(0, 30));
      }
      return newTasks;
    });
    setInt(i.integrations || {});
    setAgents(Array.isArray(a.agents) ? a.agents : []);
    setWorkflowCatalog(Array.isArray(w.workflows) ? w.workflows : []);
  }

  async function handleApproval(taskId, decision) {
    setApprovalBusy(prev => new Set(prev).add(taskId));
    try {
      await api.post(`/taskbus/approval/${taskId}`, { decision });
      setApprovalMsg(prev => ({ ...prev, [taskId]: { ok: true, text: decision === 'approved' ? 'Approved' : 'Rejected' } }));
      await fetchAll();
    } catch (e) {
      setApprovalMsg(prev => ({ ...prev, [taskId]: { ok: false, text: e?.response?.data?.error || e.message || 'Failed' } }));
    } finally {
      setApprovalBusy(prev => { const s = new Set(prev); s.delete(taskId); return s; });
    }
  }

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const ok = await fetch(API + '/api/health').then(r => r.ok).catch(() => false);
        if (active) setBackend(ok
          ? { status: 'Online',  detail: 'Backend reachable', lastCheckedAt: new Date().toISOString() }
          : { status: 'Offline', detail: 'Backend not reachable', lastCheckedAt: new Date().toISOString() }
        );
      } catch { if (active) setBackend({ status: 'Failed', detail: 'Health check failed', lastCheckedAt: null }); }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON_FILE || !window.electronAPI?.onUpdaterStatus) return;
    return window.electronAPI.onUpdaterStatus(info => setUpdateInfo(info));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== `/app/${page}`) window.history.pushState({}, '', `/app/${page}`);
  }, [page]);

  useEffect(() => {
    const syncRoute = () => setPage(pathToPage(window.location.pathname));
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const pending = tasks.filter(t => t.status === 'waiting_approval');

  async function handleCommand(e) {
    e.preventDefault();
    if (!command.trim()) return;
    const text = command.trim();
    setCmdHistory(h => [{ text, at: new Date().toLocaleTimeString(), id: Math.random().toString(36).slice(2) }, ...h].slice(0, 6));
    setCommand('');
    try {
      await api.post('/taskbus/tasks', {
        title: text, instruction: text, assigned_agent: 'alphonso',
        approval_required: true, automation_mode: 'semi_auto', created_by: 'ui:command',
      });
      await fetchAll();
    } catch(e) { console.error('[command]', e.message); }
  }

  // ── Page renders ─────────────────────────────────────────────────────────────
  function renderDashboard() {
    const byStatus   = stats.by_status || {};
    const totalTasks = stats.total_tasks || 0;
    const completed  = byStatus.done || 0;
    const failed     = byStatus.failed || 0;
    const pendingCnt = stats.pending_approvals || 0;
    const isOnline   = backend.status === 'Online';

    return (
      <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">

<<<<<<< HEAD
        {/* ── Onboarding checklist — shown until dismissed ─────────────────── */}
        <OnboardingChecklist />

        {/* ── Hero command bar ─────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0c0c1e] via-[#09091a] to-[#0c0c18]">
          {/* Ambient glow */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(26,255,140,0.07) 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.05) 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }} />

          <div className="relative p-5 sm:p-6">
            {/* Top row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <LiveDot />
                <span className="text-[11px] font-mono text-[#1aff8c]/70 uppercase tracking-[0.2em]">
                  {isOnline ? 'System operational' : 'System offline'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                <span>{totalTasks} tasks</span>
                <span className="text-zinc-700">·</span>
                <span>{agents.length} agents</span>
                {pending.length > 0 && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-amber-400 font-semibold blink">{pending.length} need review</span>
                  </>
                )}
              </div>
            </div>

            {/* Headline */}
            <div className="mb-5">
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight tracking-tight">
                Agent <span style={{ color: '#1aff8c' }}>Command</span> Center
              </h1>
              <p className="text-sm text-zinc-500 mt-1">Type a command. ACC coordinates the agents. You approve before it ships.</p>
            </div>

            {/* Command input */}
            <form onSubmit={handleCommand} className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.10] bg-black/40 px-4 py-3 focus-within:border-[#1aff8c]/40 focus-within:shadow-[0_0_0_1px_rgba(26,255,140,0.12)] transition-all">
                <Terminal size={15} className="text-zinc-500 flex-shrink-0" />
                <input
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  placeholder="Ask ACC to do anything — send an email, research a company, post to Telegram..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={!command.trim()}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-30"
                  style={{ background: command.trim() ? 'rgba(26,255,140,0.15)' : 'transparent', color: '#1aff8c', border: '1px solid rgba(26,255,140,0.25)' }}
                >
                  <Send size={12} />
                  Send
                </button>
              </div>
            </form>

            {/* Recent commands */}
            {cmdHistory.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {cmdHistory.slice(0, 4).map(cmd => (
                  <button key={cmd.id} onClick={() => setCommand(cmd.text)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-zinc-500 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:text-zinc-300 transition-all truncate max-w-[200px]">
                    <Clock size={9} className="flex-shrink-0" />
                    <span className="truncate">{cmd.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Tasks"     value={totalTasks} icon={Layers}       color="#1aff8c" />
          <StatCard label="Completed"       value={completed}  icon={CheckCircle2} color="#1aff8c" />
          <StatCard label="Needs Review"    value={pendingCnt} icon={AlertTriangle} color="#f59e0b" />
          <StatCard label="Failed"          value={failed}     icon={XCircle}      color="#f87171" />
        </div>

        {/* ── Main grid ────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">

          {/* Recent tasks */}
          <Card>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-0.5">Live queue</div>
                <h3 className="text-sm font-semibold text-white">Recent Tasks</h3>
              </div>
              <div className="flex items-center gap-3">
                <LiveDot />
                <button onClick={() => setPage('tasks')} className="text-[11px] text-[#1aff8c]/70 hover:text-[#1aff8c] flex items-center gap-1 transition-colors">
                  View all <ArrowRight size={11} />
                </button>
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-zinc-600">
                  <Activity size={28} className="mb-3 opacity-40" />
                  <div className="text-sm">No tasks yet</div>
                  <div className="text-xs mt-1 text-zinc-700">Use the command bar above or send a message via Telegram</div>
                </div>
              ) : tasks.slice(0, 8).map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
                    <Bot size={13} className="text-zinc-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-200 truncate font-medium">{t.title || t.id?.slice(0,18)}</div>
                    <div className="text-[11px] text-zinc-600 mt-0.5">{t.assigned_agent} · {taskTime(t.created_at)}</div>
                  </div>
                  <StatusPill status={t.status} />
                </div>
              ))}
            </div>
          </Card>

          {/* Right column */}
          <div className="space-y-4">

            {/* Pending approvals call-out */}
            {pending.length > 0 && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span className="text-sm font-semibold text-white">{pending.length} Pending {pending.length === 1 ? 'Approval' : 'Approvals'}</span>
                  </div>
                  <button onClick={() => setPage('approvals')} className="text-[11px] text-amber-400/80 hover:text-amber-400 flex items-center gap-1">
                    Review <ArrowRight size={11} />
                  </button>
                </div>
                <div className="space-y-2">
                  {pending.slice(0, 3).map(t => (
                    <div key={t.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 blink" />
                      <span className="text-xs text-zinc-300 truncate flex-1">{t.title || t.id?.slice(0,20)}</span>
                      <span className="text-[10px] text-zinc-600 flex-shrink-0">{t.assigned_agent}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent roster */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-0.5">Roster</div>
                  <h3 className="text-sm font-semibold text-white">Active Agents</h3>
                </div>
                <button onClick={() => setPage('agents')} className="text-[11px] text-zinc-600 hover:text-zinc-300 flex items-center gap-1 transition-colors">
                  All <ArrowRight size={11} />
                </button>
              </div>
              {agents.length === 0 ? (
                <div className="text-xs text-zinc-600 py-4 text-center">Loading agents…</div>
              ) : (
                <div className="space-y-2">
                  {agents.slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.provider_status === 'connected' ? 'bg-emerald-400' : a.provider_status === 'error' ? 'bg-red-400' : 'bg-zinc-600'}`} />
                      <span className="text-xs font-medium text-zinc-200 flex-1 truncate">{a.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${a.enabled ? 'border-[#1aff8c]/20 text-[#1aff8c]/70' : 'border-zinc-700 text-zinc-600'}`}>
                        {a.enabled ? 'on' : 'off'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Quick actions */}
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-3">Quick actions</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'New Task',    action: () => setPage('assistant'), icon: Play, color: '#1aff8c' },
                  { label: 'Approvals',  action: () => setPage('approvals'),  icon: ShieldCheck, color: '#f59e0b' },
                  { label: 'Messages',   action: () => setPage('messages'),   icon: MessageSquare, color: '#00d4ff' },
                  { label: 'Integrations', action: () => setPage('integrations'), icon: Plug, color: '#a78bfa' },
                ].map(({ label, action, icon: Icon, color }) => (
                  <button key={label} onClick={action}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 text-left hover:border-white/[0.14] hover:bg-white/[0.04] transition-all group">
                    <Icon size={13} style={{ color }} className="flex-shrink-0" />
                    <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">{label}</span>
                  </button>
                ))}
              </div>
            </Card>

          </div>
        </div>

        {/* ── Activity log ─────────────────────────────────────────────────── */}
        {activityLog.length > 0 && (
          <Card>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-[#1aff8c]" />
                <h3 className="text-sm font-semibold text-white">Live Activity</h3>
              </div>
              <LiveDot />
            </div>
            <div className="divide-y divide-white/[0.04]">
              {activityLog.slice(0, 5).map((e, i) => (
                <div key={e.id + i} className="flex items-center gap-3 px-5 py-3 row-in" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1aff8c] flex-shrink-0" />
                  <span className="text-xs text-zinc-300 flex-1 truncate">{e.text}</span>
                  <span className="text-[11px] text-zinc-600 flex-shrink-0 font-mono">{e.at}</span>
                  <StatusPill status={e.status} />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  function renderTasks() {
    const waiting  = tasks.filter(t => t.status === 'waiting_approval').length;
    const running  = tasks.filter(t => t.status === 'in_progress').length;
    const done     = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const failed   = tasks.filter(t => t.status === 'failed').length;
    return (
      <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Work inventory</div>
          <h2 className="text-xl font-bold text-white">Tasks</h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Needs Review" value={waiting} icon={AlertTriangle} color="#f59e0b" />
          <StatCard label="Running"      value={running} icon={Activity}      color="#38bdf8" />
          <StatCard label="Completed"    value={done}    icon={CheckCircle2}  color="#1aff8c" />
          <StatCard label="Failed"       value={failed}  icon={XCircle}       color="#f87171" />
        </div>

        <Card className="overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06]">
            <div className="grid grid-cols-[2fr_1fr_1fr_0.7fr] gap-4 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              <span>Task</span><span>Agent</span><span>Status</span><span>Time</span>
            </div>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {tasks.length === 0
              ? <div className="py-14 text-center text-sm text-zinc-600">No tasks yet. Use the command bar on the dashboard.</div>
              : tasks.map((t, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_0.7fr] gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors fade-in" style={{ animationDelay: `${i * 20}ms` }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-200">{t.title}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-600 font-mono">#{String(t.id || '').slice(0,8)}</div>
                  </div>
                  <div className="text-sm text-zinc-500 self-center truncate">{t.assigned_agent}</div>
                  <div className="self-center"><StatusPill status={t.status} /></div>
                  <div className="text-xs text-zinc-600 self-center">{taskTime(t.created_at)}</div>
                </div>
              ))
            }
          </div>
        </Card>
      </div>
    );
  }

  function renderApprovals() {
    return (
      <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Human in the loop</div>
            <h2 className="text-xl font-bold text-white">Approvals</h2>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2 text-sm text-zinc-400">
            <ShieldCheck size={14} className="text-[#1aff8c]" />
            {pending.length} pending
          </div>
        </div>

        {pending.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <CheckCircle2 size={32} className="mb-3 text-[#1aff8c]/30" />
            <div className="text-sm font-medium text-zinc-500">All clear</div>
            <div className="text-xs mt-1 text-zinc-700">No pending approvals right now.</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map(t => {
              const busy = approvalBusy.has(t.id);
              const msg  = approvalMsg[t.id];
              return (
                <Card key={t.id} className="p-5 border-[#1aff8c]/15" glow>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
                    <div>
                      <div className="text-base font-semibold text-white">{t.title}</div>
                      <div className="mt-1 text-xs text-zinc-500 font-mono">
                        {t.assigned_agent} · #{t.id?.slice(0,8)} · {taskTime(t.created_at)}
                      </div>
                    </div>
                    <StatusPill status={t.status} />
                  </div>
                  {t.instruction && (
                    <div className="mb-4 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 text-xs text-zinc-400 leading-relaxed">
                      {t.instruction}
                    </div>
                  )}
                  {msg && (
                    <div className={`mb-3 rounded-xl px-3 py-2 text-xs ${msg.ok ? 'text-[#1aff8c] bg-[#1aff8c]/8 border border-[#1aff8c]/20' : 'text-red-300 bg-red-500/8 border border-red-500/20'}`}>
                      {msg.text}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => handleApproval(t.id, 'approved')}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1aff8c]/25 bg-[#1aff8c]/8 text-xs font-semibold text-[#1aff8c] hover:bg-[#1aff8c]/15 disabled:opacity-40 transition-all">
                      <CheckCircle2 size={13} />{busy ? 'Processing…' : 'Approve'}
                    </button>
                    <button disabled={busy} onClick={() => handleApproval(t.id, 'rejected')}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/25 bg-red-500/8 text-xs font-semibold text-red-300 hover:bg-red-500/15 disabled:opacity-40 transition-all">
                      <XCircle size={13} />{busy ? '…' : 'Reject'}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderAgents() {
    const dotColor = s => s === 'connected' ? '#1aff8c' : s === 'error' ? '#f87171' : '#52525b';
    return (
      <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Roster</div>
            <h2 className="text-xl font-bold text-white">Agents</h2>
          </div>
          <span className="text-xs text-zinc-500 border border-white/[0.08] rounded-xl px-3 py-1.5">{agents.length} registered</span>
        </div>
        {agents.length === 0 ? (
          <Card className="py-14 text-center text-zinc-600 text-sm">Loading agents…</Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((a, i) => (
              <Card key={a.id} className="p-5 hover:border-white/[0.12] transition-colors fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl border border-white/[0.08] bg-black/30 flex items-center justify-center">
                    <Bot size={18} className="text-zinc-400" />
                  </div>
                  <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: dotColor(a.provider_status) }} />
                </div>
                <div className="font-semibold text-white text-sm">{a.name}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{a.role}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${a.enabled ? 'border-[#1aff8c]/20 bg-[#1aff8c]/8 text-[#1aff8c]' : 'border-zinc-700/50 bg-zinc-800/50 text-zinc-500'}`}>
                    {a.enabled ? 'enabled' : 'disabled'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-white/[0.08] bg-black/20 text-zinc-500">{a.automation_mode}</span>
                </div>
                {a.provider_note && <div className="mt-2 text-[11px] text-zinc-600 truncate">{a.provider_note}</div>}
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderIntegrations() {
    const keys = Object.keys(integrations);
    const statusDot = s => s === 'connected' ? 'bg-emerald-400' : s === 'error' ? 'bg-red-400' : s === 'disabled' ? 'bg-zinc-600' : 'bg-amber-400';
    const statusText = s => s === 'connected' ? 'text-emerald-400' : s === 'error' ? 'text-red-400' : s === 'disabled' ? 'text-zinc-500' : 'text-amber-400';
    return (
      <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Connected systems</div>
          <h2 className="text-xl font-bold text-white">Integrations</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {keys.length === 0
            ? <div className="col-span-3 py-12 text-center text-zinc-600 text-sm">Loading integrations…</div>
            : keys.map(k => {
                const v = integrations[k] || {};
                return (
                  <Card key={k} className="p-4 hover:border-white/[0.12] transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg border border-white/[0.08] bg-black/20 flex items-center justify-center">
                        <Plug size={13} className="text-zinc-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white capitalize">{k}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${statusDot(v.status)}`} />
                          <span className={`text-[11px] font-medium ${statusText(v.status)}`}>{v.status || 'unknown'}</span>
                        </div>
                      </div>
                    </div>
                    {v.note && <div className="text-[11px] text-zinc-600 mt-1">{v.note}</div>}
                  </Card>
                );
              })
          }
        </div>
      </div>
    );
  }

  function renderSettings() {
    const intKeys = Object.keys(integrations);
    const statusDot = s => s === 'connected' ? 'bg-emerald-400' : s === 'error' ? 'bg-red-400' : s === 'disabled' ? 'bg-zinc-600' : 'bg-amber-400';
    const statusText = s => s === 'connected' ? 'text-emerald-400' : s === 'error' ? 'text-red-400' : s === 'disabled' ? 'text-zinc-500' : 'text-amber-400';
    return (
      <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Configuration</div>
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <p className="text-xs text-zinc-600 mt-1">Live integration health. API keys are never exposed to the browser.</p>
        </div>
        <Card className="overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-white">Integration Health</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {intKeys.length === 0
              ? <div className="py-8 text-center text-zinc-600 text-sm">Loading…</div>
              : intKeys.map(k => {
                  const v = integrations[k] || {};
                  return (
                    <div key={k} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(v.status)}`} />
                          <span className="text-sm text-zinc-200 capitalize font-medium">{k}</span>
                        </div>
                        {v.note && <div className="ml-3.5 mt-0.5 text-xs text-zinc-600">{v.note}</div>}
                        {v.error && <div className="ml-3.5 mt-0.5 text-xs text-red-500 truncate">{v.error}</div>}
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${statusText(v.status)}`}>{v.status || 'unknown'}</span>
                    </div>
                  );
                })
            }
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#1aff8c] blink" />
            <div className="text-sm font-semibold text-white">Telegram Bot</div>
          </div>
          <p className="text-xs text-zinc-500">Running 24/7 on Railway in webhook mode. No local process needed.</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#1aff8c]/15 bg-[#1aff8c]/5 px-3 py-2">
            <span className="text-xs font-mono text-[#1aff8c]">@OurAccbot</span>
            <span className="text-xs text-zinc-600">· Telegram webhook active</span>
          </div>
        </Card>
        <GmailConnectPanel />
      </div>
    );
  }

  const pages = {
    dashboard:    renderDashboard,
    tasks:        renderTasks,
    approvals:    renderApprovals,
    messages:     () => <MessengerPage />,
    assistant:    () => <AssistantPage />,
    synapse:      () => <SynapsePage />,
    workflows:    () => <WorkflowsPage />,
    autonomy:     () => <AutonomyPage />,
    agents:       renderAgents,
    integrations: renderIntegrations,
    audit:        () => <AuditPage />,
    admin:        () => <AdminPage />,
    settings:     renderSettings,
  };

  const currentNav = NAV.find(n => n.id === page);

  return (
    <div className="flex flex-col h-screen bg-[#050508] text-white overflow-hidden">

      {/* ── Update banners ──────────────────────────────────────────────────── */}
      {updateInfo?.status === 'available' && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#1aff8c]/8 border-b border-[#1aff8c]/15 text-xs font-mono shrink-0">
          <span className="text-[#1aff8c]">↓ Update v{updateInfo.version} is downloading…</span>
          <button onClick={() => setUpdateInfo(null)} className="text-zinc-500 hover:text-white">✕</button>
        </div>
      )}
      {updateInfo?.status === 'ready' && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#1aff8c]/12 border-b border-[#1aff8c]/25 text-xs shrink-0">
          <span className="text-[#1aff8c] font-bold">✓ ACC v{updateInfo.version} ready to install</span>
          <div className="flex items-center gap-2">
            <button onClick={() => IS_ELECTRON_FILE && window.electronAPI?.updaterInstall()}
              className="px-3 py-1 rounded-lg bg-[#1aff8c] text-black font-bold text-xs hover:bg-[#1aff8c]/80 transition-colors">
              Restart &amp; Update
            </button>
            <button onClick={() => setUpdateInfo(null)} className="text-zinc-500 hover:text-white text-xs">Later</button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} pending={pending} backend={backend} />

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#07071a]/95 backdrop-blur">
            <div className="flex items-center gap-3">
              <button onClick={() => setCollapsed(v => !v)} className="hidden md:flex w-7 h-7 rounded-lg border border-white/[0.08] bg-white/[0.03] items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.07] transition-all">
                {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
              </button>
              {currentNav && (
                <div className="flex items-center gap-2">
                  <currentNav.Icon size={14} className="text-zinc-500" />
                  <span className="text-sm font-semibold text-zinc-200">{currentNav.label}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-zinc-600">
                <span>{stats.total_tasks || 0} tasks</span>
                <span className="text-zinc-700">·</span>
                <span>{agents.length} agents</span>
              </div>
              {pending.length > 0 && (
                <button onClick={() => setPage('approvals')}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-1.5 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/14 transition-all blink">
                  <AlertTriangle size={11} />
                  {pending.length}
                </button>
              )}
              <div className="flex items-center gap-1.5">
                {backend.status === 'Online' ? <Wifi size={13} className="text-[#1aff8c]" /> : <WifiOff size={13} className="text-zinc-600" />}
                <span className={`text-[11px] font-mono font-medium ${backend.status === 'Online' ? 'text-[#1aff8c]' : 'text-zinc-600'}`}>
                  {backend.status}
                </span>
              </div>
              <button onClick={fetchAll} className="w-7 h-7 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.07] transition-all">
                <RefreshCw size={12} />
              </button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            {(pages[page] || renderDashboard)()}
          </main>
        </div>
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-[#07071a]/97 backdrop-blur px-2 pb-safe">
        <div className="grid grid-cols-5 gap-1 py-2">
          {MOBILE_NAV.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setPage(id)}
              className={`flex flex-col items-center justify-center rounded-2xl px-1 py-2 text-[10px] transition-all ${
                page === id ? 'text-[#1aff8c] bg-[#1aff8c]/10' : 'text-zinc-600 hover:text-zinc-400'
              }`}>
              <Icon size={18} className="mb-1" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
