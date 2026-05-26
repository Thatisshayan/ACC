import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getTaskbusStats, getTaskbusTasks, getTaskbusIntegrations,
  listAgents, createTask, listWorkflows, runWorkflow, runWorkflowParallel,
  getAlphonsoBridgeStatus, listAlphonsoBridgePackets,
  getSocialclawAccounts, getSocialclawUsage,
  previewSocialclawCampaign, validateSocialclawCampaign,
  publishSocialclawCampaign, deleteSocialclawPost,
} from './api.js';
import api from './api.js';
import MessengerPage from './pages/Messenger.jsx';
import AssistantPage from './pages/Assistant.jsx';
import AdminPage     from './pages/Admin.jsx';

const API = (typeof window !== 'undefined' && window.electronAPI) ? 'http://localhost:4000' : '';

// ── Live pulse hook ───────────────────────────────────────────────────────────
function useLivePulse(ms = 1800) {
  const [on, setOn] = useState(true);
  useEffect(() => { const id = setInterval(() => setOn(v => !v), ms); return () => clearInterval(id); }, [ms]);
  return on;
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
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

// ── Elapsed timer ─────────────────────────────────────────────────────────────
function useElapsed() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = setInterval(() => setS(v => v + 1), 1000); return () => clearInterval(id); }, []);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// ── Backend status ────────────────────────────────────────────────────────────
const DEFAULT_BACKEND_STATUS = { status: 'Offline', detail: 'Checking…', lastCheckedAt: null };
function normalizeBackendStatus(next) {
  if (!next) return DEFAULT_BACKEND_STATUS;
  if (typeof next === 'string') return { ...DEFAULT_BACKEND_STATUS, status: next };
  return { status: next.status || 'Offline', detail: next.detail || '…', lastCheckedAt: next.lastCheckedAt || null };
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function taskTime(value) {
  if (!value) return 'just now';
  try { return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return 'just now'; }
}

const AGENT_ICONS = {
  chatgpt: '🧠', claude: '✳️', gemini: '💎', notebooklm: '📓',
  clickup: '📋', crewai: '👥', replicate_video: '🎬',
  openhands: '🤝', aider: '⚡', devika: '🤖', alphonso: '🦙',
  composio: '🔌', perplexity: '🔍', deepseek: '🧬',
};

// ── Navigation ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard',    label: 'Dashboard',    icon: '📊' },
  { id: 'tasks',        label: 'Tasks',         icon: '📋' },
  { id: 'approvals',    label: 'Approvals',     icon: '✅' },
  { id: 'messages',     label: 'Messages',     icon: '💬' },
  { id: 'assistant',    label: 'Assistant',    icon: '🎙️' },
  { id: 'agents',       label: 'Agents',        icon: '🤖' },
  { id: 'integrations', label: 'Integrations',  icon: '🔗' },
  { id: 'admin',        label: 'Admin',         icon: '🛡️' },
  { id: 'settings',     label: 'Settings',      icon: '⚙️' },
];

const MOBILE_NAV = [
  { id: 'dashboard',  label: 'Home',    icon: '🏠' },
  { id: 'messages',   label: 'Chat',    icon: '💬' },
  { id: 'assistant',  label: 'Talk',    icon: '🎙️' },
  { id: 'approvals',  label: 'Approve', icon: '✅' },
  { id: 'settings',   label: 'More',    icon: '⚙️' },
];

const PAGE_PATHS = new Set(['dashboard','tasks','approvals','messages','assistant','agents','integrations','admin','settings']);
function pathToPage(p) { const n = String(p||'').replace(/^\/+/,'').trim().toLowerCase(); return PAGE_PATHS.has(n) ? n : 'dashboard'; }

// ── Shared UI components ──────────────────────────────────────────────────────
function Surface({ className = '', children, glow = false }) {
  return (
    <div className={`rounded-3xl border border-white/[0.07] bg-[#0d0d14] shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur ${glow ? 'border-glow-green' : ''} ${className}`}>
      {children}
    </div>
  );
}

function Badge({ status }) {
  const map = {
    done:             'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    completed:        'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    failed:           'bg-red-500/15 text-red-400 border-red-500/25',
    pending:          'bg-amber-500/15 text-amber-400 border-amber-500/25',
    in_progress:      'bg-blue-500/15 text-blue-400 border-blue-500/25',
    waiting_approval: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  };
  return <span className={`px-2 py-0.5 rounded-md text-xs border ${map[status] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'}`}>{status}</span>;
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        {eyebrow && <div className="text-[10px] uppercase tracking-[0.28em] text-acc-green/60">{eyebrow}</div>}
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function MetricCard({ label, value, detail, icon, tone = '' }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-black/30 p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-3xl font-bold stat-number text-white">{value}</div>
          <div className="text-sm text-zinc-400">{label}</div>
        </div>
        {icon && <div className="rounded-2xl border border-white/[0.08] bg-black/30 px-3 py-2 text-lg leading-none text-zinc-200">{icon}</div>}
      </div>
      {detail && <div className="mt-4 text-xs leading-relaxed text-zinc-500">{detail}</div>}
    </div>
  );
}

// ── Live status bar ───────────────────────────────────────────────────────────
function StatusBar({ backend, uptime }) {
  const pulse = useLivePulse(1200);
  const isOnline = backend.status === 'Online';
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full transition-opacity duration-300 ${isOnline ? 'bg-acc-green' : 'bg-zinc-600'} ${isOnline && pulse ? 'opacity-100' : 'opacity-40'}`} />
        <span className={isOnline ? 'text-acc-green' : 'text-zinc-500'}>{backend.status.toUpperCase()}</span>
      </div>
      {isOnline && (
        <>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-500">UP {uptime}</span>
        </>
      )}
    </div>
  );
}

// ── ACC Logo component ────────────────────────────────────────────────────────
function ACCLogo({ size = 36, collapsed = false }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <img
          src="/acc-logo.png"
          alt="ACC"
          className="w-full h-full object-contain rounded-full float"
          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
          style={{ display: 'block' }}
        />
        <div style={{ display: 'none' }} className="w-full h-full items-center justify-center rounded-full border border-acc-green/40 bg-acc-green/5 glow-green">
          <img src="/acc-logo.svg" alt="ACC" className="w-full h-full" />
        </div>
        {/* live ripple ring */}
        <span className="absolute inset-0 rounded-full border border-acc-green/20 animate-[ripple_2.5s_ease-out_infinite]" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="text-sm font-bold text-white tracking-wider">ACC</div>
          <div className="text-[9px] text-acc-green/60 tracking-[0.2em] uppercase">Command Center</div>
        </div>
      )}
    </div>
  );
}

// ── Live dot ─────────────────────────────────────────────────────────────────
function LiveDot() {
  return (
    <span className="relative inline-flex items-center gap-1.5">
      <span className="live-dot" />
      <span className="text-[10px] font-bold text-acc-green tracking-widest uppercase">Live</span>
    </span>
  );
}

// ── Animated stat card ────────────────────────────────────────────────────────
function AnimatedStatCard({ label, value, color = 'text-white', sub, icon }) {
  const animated = useCountUp(value);
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/40 p-5 hover:border-acc-green/20 transition-all duration-300 group">
      <div className="flex items-start justify-between gap-2 mb-2">
        {icon && <span className="text-xl opacity-70">{icon}</span>}
        <LiveDot />
      </div>
      <div className={`text-3xl font-bold stat-number count-in ${color}`}>{animated}</div>
      <div className="text-zinc-500 text-xs mt-1 uppercase tracking-[0.18em]">{label}</div>
      {sub && <div className="text-zinc-600 text-[10px] mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]           = useState(() => typeof window !== 'undefined' ? pathToPage(window.location.pathname) : 'dashboard');
  const [sidebar, setSidebar]     = useState(true);
  const [stats, setStats]         = useState({});
  const [tasks, setTasks]         = useState([]);
  const [integrations, setInt]    = useState({});
  const [backend, setBackend]     = useState(DEFAULT_BACKEND_STATUS);
  const [agents, setAgents]       = useState([]);
  const [approvalBusy, setApprovalBusy] = useState(new Set());
  const [approvalMsg, setApprovalMsg]   = useState({});
  const [socialclawDraft, setSocialclawDraft] = useState('ACC + SocialClaw publish lane: preview a polished social post about the latest workflow and bridge updates.');
  const [socialclawAction, setSocialclawAction] = useState('');
  const [socialclawResult, setSocialclawResult] = useState(null);
  const [socialclawError, setSocialclawError]   = useState('');
  const [pipelineAction, setPipelineAction]     = useState('');
  const [activityLog, setActivityLog]           = useState([]);

  const uptime = useElapsed();

  async function fetchAll() {
    const [s, t, i, a] = await Promise.all([
      getTaskbusStats().catch(() => ({})),
      getTaskbusTasks().catch(() => ({ tasks: [] })),
      getTaskbusIntegrations().catch(() => ({})),
      listAgents().catch(() => ({ agents: [] })),
    ]);
    setStats(s.stats || s || {});
    const newTasks = Array.isArray(t.tasks) ? t.tasks : Array.isArray(t) ? t : [];
    setTasks(prev => {
      // detect new tasks for activity log
      if (prev.length > 0 && newTasks.length > prev.length) {
        const added = newTasks.slice(0, newTasks.length - prev.length);
        setActivityLog(log => [
          ...added.map(task => ({ id: task.id, text: `New task: ${task.title || task.id?.slice(0,10)}`, agent: task.assigned_agent, at: new Date().toLocaleTimeString() })),
          ...log,
        ].slice(0, 20));
      }
      return newTasks;
    });
    setInt(i.integrations || {});
    setAgents(Array.isArray(a.agents) ? a.agents : []);
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
    let active = true;
    let cleanupBackend = () => {};

    const syncBackendStatus = async () => {
      if (window.electronAPI?.backendStatus) {
        try { const cur = await window.electronAPI.backendStatus(); if (active) setBackend(normalizeBackendStatus(cur)); } catch {}
        if (window.electronAPI?.onBackendStatus) cleanupBackend = window.electronAPI.onBackendStatus(n => { if (active) setBackend(normalizeBackendStatus(n)); });
        return;
      }
      const refresh = async () => {
        try {
          const ok = await fetch(API + '/api/health').then(r => r.ok).catch(() => false);
          if (active) setBackend(ok
            ? { status: 'Online', detail: 'Backend reachable', lastCheckedAt: new Date().toISOString() }
            : { status: 'Offline', detail: 'Backend not reachable', lastCheckedAt: new Date().toISOString() }
          );
        } catch { if (active) setBackend({ status: 'Failed', detail: 'Health check failed', lastCheckedAt: null }); }
      };
      await refresh();
      const id = setInterval(refresh, 5000);
      cleanupBackend = () => clearInterval(id);
    };

    fetchAll();
    const id = setInterval(fetchAll, 8000);
    syncBackendStatus();

    const syncRoute = () => { if (typeof window === 'undefined') return; const np = pathToPage(window.location.pathname); if (np !== page) setPage(np); };
    if (typeof window !== 'undefined') { window.addEventListener('popstate', syncRoute); syncRoute(); }

    return () => { active = false; clearInterval(id); cleanupBackend(); if (typeof window !== 'undefined') window.removeEventListener('popstate', syncRoute); };
  }, [page]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cur = pathToPage(window.location.pathname);
    if (cur !== page || window.location.pathname !== `/${page}`) window.history.pushState({}, '', `/${page}`);
  }, [page]);

  const pending      = tasks.filter(t => t.status === 'waiting_approval');
  const socialclaw   = integrations.socialclaw || {};
  const socialclawIsReady = socialclaw.status === 'connected';
  const publisherInbox = tasks.filter(t => {
    const m = t.meta || {};
    return t.assigned_agent === 'socialclaw' || m.workflow_key === 'acc:social_publish_pipeline' || m.workflow_stage === 'publish' || m.workflow_stage === 'generate';
  }).slice(0, 4);

  async function handleSocialClaw(action) {
    setSocialclawAction(action); setSocialclawError('');
    try {
      const payload = { source: 'acc-ui', title: 'ACC social publish lane', content: socialclawDraft, caption: socialclawDraft, platform: 'social', lane: 'publish' };
      let result;
      if      (action === 'accounts') result = await getSocialclawAccounts();
      else if (action === 'usage')    result = await getSocialclawUsage();
      else if (action === 'validate') result = await validateSocialclawCampaign(payload);
      else if (action === 'publish')  result = await publishSocialclawCampaign(payload);
      else if (action === 'delete')   result = await deleteSocialclawPost(payload);
      else                            result = await previewSocialclawCampaign(payload);
      setSocialclawResult(result);
    } catch (err) {
      setSocialclawError(err?.response?.data?.error || err?.message || 'Action failed');
      setSocialclawResult(null);
    } finally { setSocialclawAction(''); }
  }

  async function launchSocialPublishPipeline() {
    setPipelineAction('launching'); setSocialclawError('');
    try {
      const result = await createTask({ title: 'ACC Social Draft Pipeline', instruction: 'Draft a professional social post about ACC workflow orchestration and the SocialClaw handoff.', assigned_agent: 'alphonso', priority: 'high', required_output: 'Social-ready draft and handoff', approval_required: false, automation_mode: 'semi_auto', feature_ref: 'workflow:acc:social_publish_pipeline', created_by: 'chatgpt', meta: { workflow_key: 'acc:social_publish_pipeline', workflow_kind: 'publishing_pipeline', workflow_stage: 'generate', workflow_target_connector: 'socialclaw', workflow_input: socialclawDraft } });
      setSocialclawResult(result);
    } catch (err) { setSocialclawError(err?.response?.data?.error || err?.message || 'Failed'); setSocialclawResult(null); }
    finally { setPipelineAction(''); }
  }

  // ── Page renders ─────────────────────────────────────────────────────────────

  function renderDashboard() {
    const byStatus  = stats.by_status || {};
    const totalTasks = stats.total_tasks || 0;
    const completed  = byStatus.done || 0;
    const failed     = byStatus.failed || 0;
    const pendingCnt = stats.pending_approvals || 0;

    return (
      <div className="p-4 sm:p-6 space-y-5 acc-grid-bg min-h-screen">

        {/* ── Banner hero ────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-acc-green/20 bg-black shadow-[0_0_60px_rgba(26,255,140,0.07)]">
          {/* Banner image */}
          <div className="relative w-full" style={{ minHeight: 140 }}>
            <img
              src="/acc-banner.png"
              alt="ACC v2"
              className="w-full object-cover"
              style={{ maxHeight: 220, objectPosition: 'center top' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
            {/* Fallback gradient header shown always as overlay / when image missing */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
            {/* Scan line animation */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="scanline absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-acc-green/50 to-transparent" />
            </div>
            {/* Content overlay */}
            <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-8 py-5">
              <div className="flex items-center gap-2 mb-2">
                <LiveDot />
                <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">AI Operating System for Execution</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                Agent <span className="text-acc-green">Command</span> Center
                <span className="ml-2 text-sm font-mono text-acc-green/60 border border-acc-green/30 px-1.5 py-0.5 rounded align-middle">v2</span>
              </h1>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">Define the goal. <span className="text-acc-green font-semibold">We execute the rest.</span></p>
            </div>
          </div>

          {/* System status ticker */}
          <div className="border-t border-white/[0.06] bg-black/80 px-5 py-2.5 flex flex-wrap items-center gap-4 text-[11px] font-mono">
            <StatusBar backend={backend} uptime={uptime} />
            <span className="text-zinc-700 hidden sm:inline">│</span>
            <span className="text-zinc-500 hidden sm:inline">{totalTasks} tasks total</span>
            <span className="text-zinc-700 hidden sm:inline">│</span>
            <span className="text-zinc-500 hidden sm:inline">{agents.length} agents registered</span>
            <span className="text-zinc-700 hidden sm:inline">│</span>
            <span className="text-zinc-500 hidden sm:inline">@OurAccbot</span>
            {pending.length > 0 && (
              <>
                <span className="text-zinc-700">│</span>
                <span className="text-amber-400 font-bold blink">{pending.length} PENDING APPROVAL{pending.length > 1 ? 'S' : ''}</span>
              </>
            )}
          </div>
        </div>

        {/* ── Stat cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AnimatedStatCard label="Total Tasks"  value={totalTasks} color="text-white"          icon="📋" />
          <AnimatedStatCard label="Completed"    value={completed}  color="text-acc-green"       icon="✅" />
          <AnimatedStatCard label="Failed"       value={failed}     color="text-red-400"          icon="❌" />
          <AnimatedStatCard label="Awaiting"     value={pendingCnt} color="text-amber-400"        icon="⏳" />
        </div>

        {/* ── Main grid ──────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">

          {/* SocialClaw publish lane */}
          <Surface className="p-5 sm:p-6">
            <SectionHeader
              eyebrow="Publishing lane"
              title="SocialClaw handoff"
              description="Plan in ACC, generate with Alphonso, review, then publish."
              action={<span className={`rounded-full border px-3 py-1 text-xs ${socialclawIsReady ? 'border-acc-green/30 bg-acc-green/12 text-acc-green' : 'border-amber-500/20 bg-amber-500/12 text-amber-300'}`}>{socialclaw.status || 'setup_required'}</span>}
            />
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/30 p-4">
              <div className="grid gap-2 text-[11px] sm:grid-cols-4 text-center">
                {['1. ACC intake','2. Alphonso generate','3. ACC approval','4. SocialClaw publish'].map((s,i) => (
                  <div key={i} className={`rounded-xl border px-3 py-2 ${i === 0 ? 'border-acc-green/30 text-acc-green' : 'border-white/[0.08] text-zinc-400'}`}>{s}</div>
                ))}
              </div>
              <textarea value={socialclawDraft} onChange={e => setSocialclawDraft(e.target.value)} rows={3}
                className="mt-4 w-full rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-acc-green/40 resize-none" placeholder="Draft the social post…" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={launchSocialPublishPipeline} disabled={!!pipelineAction}
                  className="rounded-xl border border-acc-green/30 bg-acc-green/12 px-4 py-2 text-xs font-medium text-acc-green hover:bg-acc-green/20 disabled:opacity-50 transition-all">
                  {pipelineAction ? 'Launching…' : 'Launch pipeline'}
                </button>
                <button onClick={() => handleSocialClaw('preview')} disabled={!!socialclawAction}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50 transition-all">
                  {socialclawAction === 'preview' ? 'Previewing…' : 'Preview'}
                </button>
                <button onClick={() => handleSocialClaw('validate')} disabled={!!socialclawAction}
                  className="rounded-xl border border-sky-500/25 bg-sky-500/12 px-4 py-2 text-xs text-sky-300 hover:bg-sky-500/18 disabled:opacity-50 transition-all">
                  {socialclawAction === 'validate' ? 'Validating…' : 'Validate'}
                </button>
              </div>
            </div>
          </Surface>

          {/* Live activity feed */}
          <Surface className="p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-acc-green/60 mb-0.5">Activity</div>
                <h3 className="text-base font-semibold text-white">Live feed</h3>
              </div>
              <LiveDot />
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto max-h-64 scrollbar-hide">
              {activityLog.length === 0 && tasks.slice(0, 8).map((t, i) => (
                <div key={t.id} className="row-in flex items-center gap-3 rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2.5"
                  style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="text-base">{AGENT_ICONS[t.assigned_agent] || '🤖'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white truncate">{t.title || t.id?.slice(0,14)}</div>
                    <div className="text-[10px] text-zinc-600">{t.assigned_agent} · {taskTime(t.created_at)}</div>
                  </div>
                  <Badge status={t.status} />
                </div>
              ))}
              {activityLog.map((e, i) => (
                <div key={e.id + i} className="row-in flex items-center gap-3 rounded-xl border border-acc-green/10 bg-acc-green/5 px-3 py-2.5">
                  <span className="text-base">{AGENT_ICONS[e.agent] || '🤖'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white truncate">{e.text}</div>
                    <div className="text-[10px] text-zinc-600">{e.at}</div>
                  </div>
                  <span className="text-[10px] text-acc-green font-bold">NEW</span>
                </div>
              ))}
              {tasks.length === 0 && activityLog.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-600 text-sm">
                  <span className="text-2xl mb-2">📡</span>
                  Waiting for tasks…
                </div>
              )}
            </div>
          </Surface>
        </div>

        {/* ── Recent tasks grid ─────────────────────────────────────────────── */}
        <Surface>
          <div className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between">
            <SectionHeader eyebrow="Live feed" title="Recent tasks" />
            <LiveDot />
          </div>
          <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2 xl:grid-cols-3">
            {tasks.slice(0, 9).map((t, i) => (
              <div key={t.id} className="fade-in rounded-2xl border border-white/[0.06] bg-black/30 p-4 hover:border-acc-green/20 transition-all duration-300"
                style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{t.title || t.id?.slice(0, 12)}</div>
                    <div className="mt-1 text-xs text-zinc-500">{t.assigned_agent} · {t.created_by}</div>
                  </div>
                  <Badge status={t.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  <div className="rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2">
                    <div className="uppercase tracking-[0.18em] text-[9px] text-zinc-700">Created</div>
                    <div className="mt-1 text-zinc-400">{taskTime(t.created_at)}</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2">
                    <div className="uppercase tracking-[0.18em] text-[9px] text-zinc-700">State</div>
                    <div className="mt-1 text-zinc-400">{t.status}</div>
                  </div>
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-acc-green/10 bg-acc-green/[0.02] px-5 py-12 text-center text-sm text-zinc-600">
                <div className="text-3xl mb-3">📡</div>
                No tasks yet. Send a task to <span className="text-acc-green font-mono">@OurAccbot</span>
              </div>
            )}
          </div>
        </Surface>
      </div>
    );
  }

  function renderTasks() {
    const statusGroups = [
      { key: 'waiting_approval', label: 'Waiting approval', tone: 'text-amber-300', bg: 'bg-amber-500/8 border-amber-500/15' },
      { key: 'in_progress',      label: 'In progress',      tone: 'text-sky-300',   bg: 'bg-sky-500/8 border-sky-500/15' },
      { key: 'done',             label: 'Done',             tone: 'text-acc-green', bg: 'bg-acc-green/8 border-acc-green/15' },
      { key: 'failed',           label: 'Failed',           tone: 'text-red-300',   bg: 'bg-red-500/8 border-red-500/15' },
    ];
    return (
      <div className="p-4 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <Surface className="p-5 sm:p-6">
          <SectionHeader eyebrow="Work inventory" title="All tasks" description="A calm board for scanning work in flight." />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statusGroups.map(g => {
              const count = tasks.filter(t => t.status === g.key).length;
              return (
                <div key={g.key} className={`rounded-2xl border p-4 ${g.bg}`}>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{g.label}</div>
                  <AnimatedStatCard label="" value={count} color={g.tone} />
                </div>
              );
            })}
          </div>
        </Surface>
        <Surface className="overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              <span>Title</span><span>Agent</span><span>Status</span><span>Created</span>
            </div>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {tasks.length === 0
              ? <div className="px-5 py-10 text-center text-sm text-zinc-600">No tasks yet.</div>
              : tasks.map((t, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-3.5 hover:bg-acc-green/[0.02] transition-colors">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{t.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-600 font-mono">#{String(t.id || '').slice(0,8)}</div>
                  </div>
                  <div className="text-sm text-zinc-400 self-center">{t.assigned_agent}</div>
                  <div className="self-center"><Badge status={t.status} /></div>
                  <div className="text-xs text-zinc-600 self-center">{taskTime(t.created_at)}</div>
                </div>
              ))
            }
          </div>
        </Surface>
      </div>
    );
  }

  function renderApprovals() {
    return (
      <div className="p-4 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <Surface className="p-5 sm:p-6">
          <SectionHeader eyebrow="Decision queue" title={`Pending approvals (${pending.length})`} description="Every risky action stays obvious, calm, and fast to review." />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Pending"  value={pending.length} icon="🛂" detail="Waiting for human decision." />
            <MetricCard label="Urgent"   value={pending.filter(t => t.priority === 'P0').length} icon="⚡" detail="P0 items." />
            <MetricCard label="In queue" value={pending.filter(t => t.status === 'waiting_approval').length} icon="🕒" detail="Blocked by approval." />
          </div>
        </Surface>
        {pending.length === 0
          ? <Surface className="p-12 text-center text-zinc-500 text-sm">No pending approvals. All clear.</Surface>
          : <div className="grid gap-4">
              {pending.map(t => {
                const busy = approvalBusy.has(t.id);
                const msg  = approvalMsg[t.id];
                const meta = t.meta || {};
                return (
                  <Surface key={t.id} className="p-5 sm:p-6 border-glow-green">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-lg font-medium text-white">{t.title}</div>
                        <div className="mt-1 text-xs text-zinc-500">Agent: {t.assigned_agent} · Task: {t.id?.slice(0,8)} · Node: {meta.nodeId || '—'}</div>
                      </div>
                      <Badge status={t.status} />
                    </div>
                    {msg && (
                      <div className={`mt-4 rounded-xl px-3 py-2 text-xs ${msg.ok ? 'text-acc-green bg-acc-green/10 border border-acc-green/20' : 'text-red-300 bg-red-500/10 border border-red-500/20'}`}>{msg.text}</div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button disabled={busy} onClick={() => handleApproval(t.id, 'approved')}
                        className="rounded-xl border border-acc-green/30 bg-acc-green/12 px-4 py-2 text-xs font-medium text-acc-green hover:bg-acc-green/22 disabled:opacity-50 transition-all">
                        {busy ? '…' : 'Approve'}
                      </button>
                      <button disabled={busy} onClick={() => handleApproval(t.id, 'rejected')}
                        className="rounded-xl border border-red-500/30 bg-red-500/12 px-4 py-2 text-xs font-medium text-red-300 hover:bg-red-500/22 disabled:opacity-50 transition-all">
                        {busy ? '…' : 'Reject'}
                      </button>
                    </div>
                  </Surface>
                );
              })}
            </div>
        }
      </div>
    );
  }

  function renderAgents() {
    const dot = s => s === 'connected' ? 'bg-acc-green' : s === 'error' ? 'bg-red-400' : s === 'disabled' ? 'bg-zinc-600' : 'bg-amber-400';
    return (
      <div className="p-4 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-acc-green/60 mb-1">Roster</div>
            <h2 className="text-xl font-semibold text-white">Registered Agents</h2>
          </div>
          <span className="text-xs text-zinc-500 border border-white/[0.08] rounded-full px-3 py-1">{agents.length} agents</span>
        </div>
        {agents.length === 0
          ? <div className="rounded-2xl border border-white/[0.06] p-12 text-center text-zinc-600">Loading agents…</div>
          : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((a, i) => (
                <div key={a.id} className="fade-in rounded-2xl border border-white/[0.07] bg-[#0d0d14] p-5 hover:border-acc-green/25 transition-all duration-300"
                  style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-2xl float">{AGENT_ICONS[a.id] || '🤖'}</span>
                    <span className={`w-2 h-2 rounded-full mt-1.5 ${dot(a.provider_status)}`} />
                  </div>
                  <div className="font-semibold text-white">{a.name}</div>
                  <div className="text-xs text-zinc-500 mt-1">{a.role}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${a.enabled ? 'border-acc-green/30 bg-acc-green/10 text-acc-green' : 'border-zinc-700 bg-zinc-800 text-zinc-500'}`}>
                      {a.enabled ? 'enabled' : 'disabled'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.08] bg-black/20 text-zinc-400">{a.automation_mode}</span>
                    {a.provider_note && <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 truncate max-w-full">{a.provider_note}</span>}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    );
  }

  function renderIntegrations() {
    const keys = Object.keys(integrations);
    const statusColor = s => s === 'connected' ? 'border-acc-green/25 bg-acc-green/10 text-acc-green' : s === 'error' ? 'border-red-500/25 bg-red-500/10 text-red-400' : 'border-zinc-600/25 bg-zinc-600/10 text-zinc-400';
    return (
      <div className="p-4 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-acc-green/60 mb-1">Connected systems</div>
            <h2 className="text-xl font-semibold text-white">Integrations</h2>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full border ${socialclawIsReady ? 'border-acc-green/25 bg-acc-green/10 text-acc-green' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
            SocialClaw: {socialclaw.status || 'unknown'}
          </span>
        </div>

        <Surface className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-white">SocialClaw Publisher</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(socialclaw.status)}`}>{socialclaw.status || 'unknown'}</span>
          </div>
          {socialclaw.note && <p className="text-xs text-zinc-500">{socialclaw.note}</p>}
          <textarea value={socialclawDraft} onChange={e => setSocialclawDraft(e.target.value)} rows={3}
            className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-acc-green/40 resize-none" placeholder="Draft content…" />
          <div className="flex flex-wrap gap-2">
            {['preview','validate','accounts','usage','publish','delete'].map(act => (
              <button key={act} onClick={() => handleSocialClaw(act)} disabled={!!socialclawAction}
                className={`px-3 py-2 rounded-xl border text-xs transition-all disabled:opacity-50 ${
                  act === 'publish' ? 'border-acc-green/25 bg-acc-green/12 text-acc-green hover:bg-acc-green/20' :
                  act === 'delete'  ? 'border-red-500/25 bg-red-500/12 text-red-300 hover:bg-red-500/20' :
                  'border-white/10 bg-white/5 text-white hover:bg-white/10'
                }`}>
                {socialclawAction === act ? `${act}…` : act.charAt(0).toUpperCase() + act.slice(1)}
              </button>
            ))}
          </div>
          {socialclawError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{socialclawError}</div>}
          {socialclawResult && <pre className="max-h-60 overflow-auto rounded-xl border border-white/[0.08] bg-black/40 p-4 text-xs text-zinc-300 whitespace-pre-wrap">{JSON.stringify(socialclawResult, null, 2)}</pre>}
        </Surface>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {keys.length === 0
            ? <div className="col-span-3 rounded-xl border border-white/[0.06] p-12 text-center text-zinc-600">Loading integrations…</div>
            : keys.map(k => {
                const v = integrations[k] || {};
                return (
                  <div key={k} className="rounded-2xl border border-white/[0.07] bg-[#0d0d14] p-4 hover:border-acc-green/20 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-white capitalize">{k}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${statusColor(v.status)}`}>{v.status || 'unknown'}</span>
                    </div>
                    {v.note && <div className="text-xs text-zinc-600">{v.note}</div>}
                  </div>
                );
              })
          }
        </div>
      </div>
    );
  }

  function renderSettings() {
    const intKeys = Object.keys(integrations);
    const sc = s => {
      if (s === 'connected') return 'text-acc-green bg-acc-green/10 border-acc-green/20';
      if (s === 'disabled')  return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
      if (s === 'error')     return 'text-red-400 bg-red-500/10 border-red-500/20';
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    };
    return (
      <div className="p-4 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-acc-green/60 mb-1">Configuration</div>
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <p className="text-xs text-zinc-500 mt-1">Live integration health from the backend. Keys are never sent to the browser.</p>
        </div>
        <Surface className="overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-medium text-white">Integration Health</span>
          </div>
          {intKeys.length === 0
            ? <div className="px-5 py-8 text-center text-zinc-600 text-sm">Loading…</div>
            : <div className="divide-y divide-white/[0.03]">
                {intKeys.map(k => {
                  const v = integrations[k] || {};
                  return (
                    <div key={k} className="flex items-center justify-between px-5 py-3 gap-4 hover:bg-acc-green/[0.015] transition-colors">
                      <div className="min-w-0">
                        <span className="text-sm text-zinc-200 capitalize">{k}</span>
                        {v.note && <span className="ml-2 text-xs text-zinc-600">{v.note}</span>}
                        {v.error && <span className="ml-2 text-xs text-red-500 truncate">{v.error}</span>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded border flex-shrink-0 ${sc(v.status)}`}>{v.status || 'unknown'}</span>
                    </div>
                  );
                })}
              </div>
          }
        </Surface>
        <Surface className="p-5">
          <div className="text-sm font-medium text-white mb-3">Startup</div>
          <p className="text-xs text-zinc-500 mb-3">The desktop app starts the backend automatically. The Telegram bot runs 24/7 on Railway in webhook mode — no local process needed.</p>
          <div className="rounded-xl border border-acc-green/20 bg-acc-green/8 px-4 py-3 text-xs text-acc-green flex items-center gap-2">
            <span className="live-dot scale-75" />
            Bot is live on Railway. Set <code className="font-mono bg-black/30 px-1 rounded">TELEGRAM_BOT_MODE=local</code> only to run locally instead.
          </div>
          <div className="mt-4 text-xs text-zinc-600">
            <div className="mb-1 text-zinc-500 font-medium">Quick launch:</div>
            <code className="block bg-black/40 border border-white/[0.06] rounded px-3 py-2 text-acc-green font-mono">START_DASHBOARD.bat</code>
          </div>
        </Surface>
      </div>
    );
  }

  const pages = {
    dashboard:    renderDashboard,
    tasks:        renderTasks,
    approvals:    renderApprovals,
    messages:     () => <MessengerPage />,
    assistant:    () => <AssistantPage />,
    agents:       renderAgents,
    integrations: renderIntegrations,
    admin:        () => <AdminPage />,
    settings:     renderSettings,
  };

  return (
    <div className="flex h-screen bg-acc-bg text-white overflow-hidden">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div className={`hidden md:flex flex-shrink-0 flex-col transition-all duration-200 border-r border-white/[0.06] bg-[#070710] ${sidebar ? 'w-56' : 'w-16'}`}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-white/[0.06]">
          <ACCLogo size={sidebar ? 34 : 30} collapsed={!sidebar} />
          {sidebar && (
            <button onClick={() => setSidebar(false)} className="ml-auto text-zinc-600 hover:text-zinc-300 text-sm transition-colors">◀</button>
          )}
          {!sidebar && (
            <button onClick={() => setSidebar(true)} className="ml-auto text-zinc-600 hover:text-zinc-300 text-sm">▶</button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto scrollbar-hide">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                page === n.id
                  ? 'bg-acc-green/12 text-acc-green border border-acc-green/20'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}>
              <span className="text-base leading-none">{n.icon}</span>
              {sidebar && <span className="font-medium">{n.label}</span>}
              {sidebar && n.id === 'approvals' && pending.length > 0 && (
                <span className="ml-auto bg-amber-500 text-black text-[10px] px-1.5 py-0.5 rounded-full font-bold blink">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Status */}
        <div className="px-3 py-3 border-t border-white/[0.06]">
          {sidebar ? (
            <div className="rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5 space-y-1.5">
              <StatusBar backend={backend} uptime={uptime} />
              {(backend.status === 'Failed' || backend.status === 'Offline') && window.electronAPI?.retryBackendStart && (
                <button onClick={() => window.electronAPI.retryBackendStart()}
                  className="w-full rounded-lg border border-acc-green/20 bg-acc-green/8 px-3 py-1.5 text-xs text-acc-green hover:bg-acc-green/14">
                  Retry backend
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-center">
              <span className={`w-2 h-2 rounded-full ${backend.status === 'Online' ? 'bg-acc-green glow-green' : 'bg-zinc-600'}`} />
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#070710]/95 backdrop-blur border-b border-white/[0.06] px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebar(v => !v)}
              className="hidden md:inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/[0.07] hover:text-white transition-all">
              {sidebar ? '◀' : '▶'}
            </button>
            <div className="min-w-0">
              <div className="text-[10px] text-acc-green/50 uppercase tracking-[0.2em]">{page}</div>
              <div className="text-sm text-zinc-200 truncate font-medium">Agent Command Center</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-zinc-600">
              <span>{stats.total_tasks || 0} tasks</span>
              <span>·</span>
              <span>{stats.total_results || 0} results</span>
            </div>
            <StatusBar backend={backend} uptime={uptime} />
          </div>
        </div>

        {/* Page */}
        {(pages[page] || renderDashboard)()}
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-[#070710]/97 backdrop-blur px-2 py-2">
        <div className="grid grid-cols-5 gap-1">
          {MOBILE_NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] transition-all ${
                page === item.id ? 'bg-acc-green/12 text-acc-green border border-acc-green/20' : 'text-zinc-500'
              }`}>
              <span className="text-base leading-none">{item.icon}</span>
              <span className="mt-1">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
