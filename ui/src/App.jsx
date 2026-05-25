import React, { useState, useEffect } from 'react';
import { getDashboard, getAdminSystem, listWorkflows, runWorkflow, runWorkflowParallel, getAlphonsoBridgeStatus, listAlphonsoBridgePackets } from './api.js';

const API = 'http://localhost:4000';
const DEFAULT_BACKEND_STATUS = {
  status: 'Offline',
  detail: 'Checking backend...',
  lastCheckedAt: null,
};

const AGENTS = [
  { name: 'DeepSeek', icon: '🧠', desc: 'Primary AI — text, code, analysis' },
  { name: 'OpenHands', icon: '🤝', desc: 'Autonomous coding agent' },
  { name: 'Aider', icon: '⚡', desc: 'CLI coding with git integration' },
  { name: 'CrewAI', icon: '👥', desc: 'Multi-agent Python workflows' },
  { name: 'Alphonso', icon: '🦙', desc: 'Local Ollama — free & private' },
  { name: 'Composio', icon: '🔌', desc: '250+ tool integrations' },
  { name: 'Devika', icon: '🤖', desc: 'AI project coding agent' },
  { name: 'Perplexity', icon: '🔍', desc: 'Real-time web research' },
];

const NAV = [
  { id: 'workflows',    label: 'Workflows',    icon: '🧭' },
  { id: 'dashboard',    label: 'Dashboard',    icon: '📊' },
  { id: 'tasks',        label: 'Tasks',         icon: '📋' },
  { id: 'approvals',    label: 'Approvals',     icon: '✅' },
  { id: 'agents',       label: 'Agents',        icon: '🤖' },
  { id: 'integrations', label: 'Integrations',  icon: '🔗' },
  { id: 'settings',     label: 'Settings',      icon: '⚙️' },
];

function normalizeBackendStatus(next) {
  if (!next) return DEFAULT_BACKEND_STATUS;
  if (typeof next === 'string') {
    return { ...DEFAULT_BACKEND_STATUS, status: next };
  }
  return {
    status: next.status || DEFAULT_BACKEND_STATUS.status,
    detail: next.detail || DEFAULT_BACKEND_STATUS.detail,
    lastCheckedAt: next.lastCheckedAt || DEFAULT_BACKEND_STATUS.lastCheckedAt,
  };
}

function StatusPill({ backend }) {
  const map = {
    Online:  { wrap: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400', pulse: false },
    Starting:{ wrap: 'bg-amber-500/15 text-amber-400', dot: 'bg-amber-400', pulse: true },
    Offline: { wrap: 'bg-zinc-500/15 text-zinc-400', dot: 'bg-zinc-400', pulse: false },
    Failed:  { wrap: 'bg-red-500/15 text-red-400', dot: 'bg-red-400', pulse: false },
  };
  const theme = map[backend.status] || map.Offline;
  return (
    <div className={`rounded-xl border border-white/[0.06] px-3 py-2 ${theme.wrap}`}>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${theme.dot} ${theme.pulse ? 'animate-pulse' : ''}`}></span>
        <span className="text-xs font-medium">{backend.status}</span>
      </div>
      <div className="text-[11px] leading-snug opacity-80 mt-1">{backend.detail}</div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className={`text-3xl font-semibold tracking-tight ${color}`}>{value}</div>
      <div className="text-zinc-400 text-sm mt-1">{label}</div>
    </div>
  );
}

function GlassPanel({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-white/[0.02] shadow-[0_20px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl ${className}`}>
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">{title}</div>
            {subtitle && <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{subtitle}</div>}
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Badge({ status }) {
  const map = {
    done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/15 text-red-400 border-red-500/20',
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    waiting_approval: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs border ${map[status] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'}`}>
      {status}
    </span>
  );
}

function formatRelativeStamp(value) {
  if (!value) return 'just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function prettyStatus(status) {
  return String(status || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function ActionChip({ icon, label, hint, onClick, accent = false }) {
  return (
    <button
      onClick={onClick}
      className={`group min-w-0 rounded-2xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
        accent
          ? 'border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 shadow-[0_12px_40px_rgba(34,211,238,0.08)]'
          : 'border-white/[0.08] bg-black/20 hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border ${
          accent ? 'border-cyan-400/20 bg-cyan-400/15 text-cyan-200' : 'border-white/[0.08] bg-white/[0.04] text-white'
        }`}>
          <span className="text-sm">{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="mt-1 text-xs leading-5 text-zinc-500">{hint}</div>
        </div>
      </div>
    </button>
  );
}

export default function App() {
  const [page, setPage]         = useState('dashboard');
  const [sidebar, setSidebar]   = useState(true);
  const [stats, setStats]       = useState({});
  const [tasks, setTasks]       = useState([]);
  const [integrations, setInt]  = useState({});
  const [backend, setBackend]   = useState(DEFAULT_BACKEND_STATUS);
  const [workflows, setWorkflows] = useState([]);
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [workflowInput, setWorkflowInput] = useState('product manager');
  const [parallelInput, setParallelInput] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowNotice, setWorkflowNotice] = useState(null);
  const [workflowError, setWorkflowError] = useState(null);
  const [workflowLaunchResult, setWorkflowLaunchResult] = useState(null);
  const [bridgeStatus, setBridgeStatus] = useState(null);
  const [bridgePackets, setBridgePackets] = useState([]);

  async function fetchAll() {
    const [s, t, i, w, b] = await Promise.all([
      fetch(API + '/api/taskbus/stats').then(r => r.json()).catch(() => ({})),
      fetch(API + '/api/taskbus/tasks').then(r => r.json()).catch(() => ({ tasks: [] })),
      fetch(API + '/api/taskbus/integrations/status').then(r => r.json()).catch(() => ({})),
      listWorkflows().catch(() => ({ workflows: [] })),
      getAlphonsoBridgeStatus().catch(() => ({})),
    ]);
    const packets = await listAlphonsoBridgePackets(8).catch(() => ({ packets: [] }));

    setStats(s.stats || s || {});
    setTasks(Array.isArray(t.tasks) ? t.tasks : Array.isArray(t) ? t : []);
    setInt(i.integrations || {});
    setBridgeStatus(b?.bridge || packets?.bridge || null);
    setBridgePackets(Array.isArray(packets.packets) ? packets.packets : []);
    const nextWorkflows = Array.isArray(w.workflows) ? w.workflows : [];
    setWorkflows(nextWorkflows);
    setSelectedWorkflow(prev => {
      const stillExists = nextWorkflows.some(workflow => workflow.key === prev || workflow.id === prev);
      if (stillExists) return prev;
      return nextWorkflows[0] ? nextWorkflows[0].key : '';
    });
  }

  useEffect(() => {
    let active = true;
    let cleanupBackend = () => {};

    const syncBackendStatus = async () => {
      if (window.electronAPI?.backendStatus) {
        try {
          const current = await window.electronAPI.backendStatus();
          if (active) setBackend(normalizeBackendStatus(current));
        } catch {
          if (active) setBackend(DEFAULT_BACKEND_STATUS);
        }

        if (window.electronAPI?.onBackendStatus) {
          cleanupBackend = window.electronAPI.onBackendStatus((next) => {
            if (active) setBackend(normalizeBackendStatus(next));
          });
        }
        return;
      }

      const refresh = async () => {
        try {
          const ok = await fetch(API + '/api/health').then((r) => r.ok).catch(() => false);
          if (active) {
            setBackend(ok
              ? { status: 'Online', detail: 'Backend reachable at http://localhost:4000.', lastCheckedAt: new Date().toISOString() }
              : { status: 'Offline', detail: 'Backend not reachable at http://localhost:4000.', lastCheckedAt: new Date().toISOString() }
            );
          }
        } catch {
          if (active) {
            setBackend({ status: 'Failed', detail: 'Backend health check failed.', lastCheckedAt: new Date().toISOString() });
          }
        }
      };

      await refresh();
      const id = setInterval(refresh, 5000);
      cleanupBackend = () => clearInterval(id);
    };

    fetchAll();
    const id = setInterval(fetchAll, 8000);
    syncBackendStatus();

    return () => {
      active = false;
      clearInterval(id);
      cleanupBackend();
    };
  }, []);

  const pending = tasks.filter(t => t.status === 'waiting_approval');

  function renderDashboard() {
    const byStatus = stats.by_status || {};
    const bridge = bridgeStatus || {};
    const taskSummary = [
      { label: 'Pending', value: byStatus.pending || 0 },
      { label: 'Active', value: byStatus.in_progress || 0 },
      { label: 'Approval', value: byStatus.waiting_approval || 0 },
      { label: 'Done', value: byStatus.done || 0 },
    ];
    const recentTasks = tasks.slice(0, 5);
    const recentResults = tasks.filter(t => ['done', 'completed'].includes(t.status)).slice(0, 4);
    const bridgeOnline = bridge.status === 'configured';
    return (
      <div className="p-6 space-y-6">
        <div className="rounded-[32px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.14),_transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02))] p-6 shadow-[0_28px_110px_rgba(0,0,0,0.38)]">
          <div className="flex items-start justify-between gap-5 flex-wrap">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-cyan-200">
                Live Command Center
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white">ACC Premium Dashboard</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                Real-time orchestration, approvals, workflows, and Alphonso bridge health in a single executive-grade surface.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={() => setPage('workflows')} className="rounded-full border border-white/[0.08] bg-black/20 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.05]">🧭 Workflows</button>
                <button onClick={() => setPage('approvals')} className="rounded-full border border-white/[0.08] bg-black/20 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.05]">✅ Approvals</button>
                <button onClick={() => setPage('tasks')} className="rounded-full border border-white/[0.08] bg-black/20 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.05]">📋 Tasks</button>
                <button onClick={() => setPage('integrations')} className={`rounded-full border px-4 py-2 text-xs font-medium transition ${bridgeOnline ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15' : 'border-white/[0.08] bg-black/20 text-zinc-200 hover:bg-white/[0.05]'}`}>🛰️ {bridgeOnline ? 'Bridge Live' : 'Bridge Setup'}</button>
              </div>
            </div>
            <StatusPill backend={backend} />
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {taskSummary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-4 shadow-inner shadow-black/10">
                <div className="text-3xl font-semibold tracking-tight text-white">{item.value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Tasks"  value={stats.total_tasks || 0} color="text-white" />
          <StatCard label="Completed"    value={byStatus.done || 0} color="text-emerald-400" />
          <StatCard label="Failed"       value={byStatus.failed || 0} color="text-red-400" />
          <StatCard label="Pending"      value={stats.pending_approvals || 0} color="text-amber-400" />
          <StatCard label="Bridge"       value={bridge.status === 'configured' ? 'Live' : 'Setup'} color={bridge.status === 'configured' ? 'text-cyan-300' : 'text-zinc-400'} />
        </div>

        <div className="grid lg:grid-cols-4 gap-4">
          <ActionChip icon="🧵" label="Open Workflows" hint="Browse the workflow catalog and launch a new lane." onClick={() => setPage('workflows')} />
          <ActionChip icon="✅" label="Review Approvals" hint="Jump straight to pending approvals and items waiting on review." onClick={() => setPage('approvals')} />
          <ActionChip icon="📋" label="Inspect Tasks" hint="Scan the live task lanes with current execution state." onClick={() => setPage('tasks')} />
          <ActionChip icon="🛰️" label={bridgeOnline ? 'Bridge Health Live' : 'Bridge Needs Setup'} hint={bridgeOnline ? 'Alphonso sync is configured and packeted.' : 'Bridge is present but not fully configured.'} onClick={() => setPage('integrations')} accent />
        </div>

        <div className="grid lg:grid-cols-[1fr_0.9fr] gap-4">
          <GlassPanel title="Alphonso Bridge Health" subtitle="ACC receiver truth, token-gated sync status, and the latest packet state.">
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-black/25 border border-white/[0.06] p-4">
                <div className="text-zinc-500 text-xs mb-1 uppercase tracking-[0.18em]">Path</div>
                <div className="text-zinc-100 font-mono break-all">{bridge.pathPrefix || '/api/alphonso-bridge'}</div>
              </div>
              <div className="rounded-2xl bg-black/25 border border-white/[0.06] p-4">
                <div className="text-zinc-500 text-xs mb-1 uppercase tracking-[0.18em]">Packets</div>
                <div className="text-zinc-100 text-lg font-semibold">{bridge.packetCount ?? 0}</div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-black/20 border border-white/[0.06] p-4">
              <div className="text-zinc-500 text-xs mb-1 uppercase tracking-[0.18em]">Latest packet</div>
              <div className="text-zinc-200 text-sm">{bridge.lastPacketKind ? bridge.lastPacketKind : 'No Alphonso packets recorded yet.'}</div>
            </div>
          </GlassPanel>

          <GlassPanel title="Recent Bridge Packets" subtitle="The latest content_job and memory packets observed by ACC.">
            <div className="space-y-2">
              {bridgePackets.length === 0
                ? <div className="text-sm text-zinc-500 rounded-2xl border border-dashed border-white/[0.08] p-5 text-center">No packets yet.</div>
                : bridgePackets.map((packet) => (
                    <div key={packet.id} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-zinc-100 truncate">{packet.kind || 'unknown'}</div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-zinc-300">{packet.status || 'received'}</span>
                      </div>
                      <div className="mt-2 text-[11px] text-zinc-500 font-mono truncate">{packet.requestId || packet.jobId || packet.id}</div>
                    </div>
                  ))}
            </div>
          </GlassPanel>
        </div>

        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-4">
          <GlassPanel title="Live Task Feed" subtitle="Freshly routed tasks with statuses that make it easy to scan the room fast.">
            <div className="space-y-2">
              {recentTasks.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-black/15 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-100 truncate">{t.title || t.id?.slice(0,12)}</div>
                    <div className="text-xs text-zinc-500 truncate mt-1">{t.assigned_agent} · {t.created_by}</div>
                  </div>
                  <Badge status={t.status} />
                </div>
              ))}
              {tasks.length === 0 && <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center text-zinc-500 text-sm">No tasks yet. Send a task to @OurAccbot to get started.</div>}
            </div>
          </GlassPanel>

          <GlassPanel title="Workflow & Approval Snapshot" subtitle="The premium control layer for workflows, approvals, and bridge health.">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Pending approvals</div>
                <div className="mt-1 text-2xl font-semibold text-white">{stats.pending_approvals || 0}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Bridge mode</div>
                <div className="mt-1 text-sm text-zinc-200">{bridge.status === 'configured' ? 'Configured and receiving packets' : 'Setup required before Alphonso sync is live'}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task lanes</div>
                <div className="mt-1 text-sm text-zinc-200">Pending {byStatus.pending || 0} · In progress {byStatus.in_progress || 0} · Waiting {byStatus.waiting_approval || 0} · Done {byStatus.done || 0}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Recent results</div>
                <div className="mt-2 space-y-2">
                  {recentResults.length === 0
                    ? <div className="text-sm text-zinc-500">No completed tasks yet.</div>
                    : recentResults.map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm text-zinc-100 truncate">{task.title || task.id}</div>
                            <div className="text-[11px] text-zinc-500">{formatRelativeStamp(task.updated_at || task.created_at)}</div>
                          </div>
                          <Badge status={task.status} />
                        </div>
                      ))}
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    );
  }

  function renderTasks() {
    const lanes = {
      pending: tasks.filter(t => t.status === 'pending'),
      in_progress: tasks.filter(t => ['in_progress', 'running'].includes(t.status)),
      waiting_approval: tasks.filter(t => t.status === 'waiting_approval'),
      done: tasks.filter(t => ['done', 'completed'].includes(t.status)),
      failed: tasks.filter(t => t.status === 'failed'),
    };

    const laneDefs = [
      ['pending', 'Pending'],
      ['in_progress', 'In Progress'],
      ['waiting_approval', 'Waiting Approval'],
      ['done', 'Completed'],
      ['failed', 'Failed'],
    ];

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-semibold text-white">Task Lanes</h2>
            <p className="mt-1 text-sm text-zinc-500">A premium lane view of the live queue with the important counts surfaced first.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Pending', lanes.pending.length],
              ['Active', lanes.in_progress.length],
              ['Approval', lanes.waiting_approval.length],
              ['Done', lanes.done.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <div className="text-lg font-semibold text-white">{value}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {laneDefs.map(([key, label]) => {
            const lane = lanes[key] || [];
            return (
              <div key={key} className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-medium text-white">{label}</div>
                    <div className="text-xs text-zinc-500 mt-1">{lane.length} task{lane.length === 1 ? '' : 's'}</div>
                  </div>
                  <Badge status={key} />
                </div>
                <div className="space-y-2 max-h-[22rem] overflow-auto pr-1">
                  {lane.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center text-sm text-zinc-500">No tasks in this lane.</div>
                  ) : lane.slice(0, 6).map((task) => (
                    <div key={task.id} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">{task.title || task.id}</div>
                          <div className="mt-1 text-xs text-zinc-500 truncate">{task.assigned_agent} ? {task.created_by} ? {formatRelativeStamp(task.updated_at || task.created_at)}</div>
                        </div>
                        <Badge status={task.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderApprovals() {
    return (
      <div className="p-6 space-y-6">
        <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(255,255,255,0.03))] p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-semibold text-white">Approvals Inbox</h2>
              <p className="mt-1 text-sm text-zinc-300">Review risky actions before they go live. Human-in-the-loop by design.</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
              <div className="text-3xl font-semibold text-amber-300">{pending.length}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Pending approvals</div>
            </div>
          </div>
        </div>

        {pending.length === 0
          ? <div className="rounded-3xl border border-dashed border-white/[0.08] p-12 text-center text-zinc-600">No pending approvals.</div>
          : <div className="grid gap-4">{pending.map((t, i) => (
              <div key={i} className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 shadow-[0_16px_60px_rgba(0,0,0,0.18)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-white mb-1 truncate">{t.title}</div>
                    <div className="text-xs text-zinc-500">Agent: {t.assigned_agent} ? Task: {t.id?.slice(0,8)} ? {formatRelativeStamp(t.created_at)}</div>
                  </div>
                  <Badge status={t.status} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-500/25">
                    /taskbus_approve_{t.id?.slice(0,8)}
                  </button>
                  <button className="px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs hover:bg-red-500/25">
                    /taskbus_reject_{t.id?.slice(0,8)}
                  </button>
                </div>
              </div>
            ))}</div>
        }
      </div>
    );
  }

  function renderAgents() {

    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Agent Roster</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {AGENTS.map(a => (
            <div key={a.name} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
              <div className="text-2xl mb-2">{a.icon}</div>
              <div className="font-medium text-white">{a.name}</div>
              <div className="text-xs text-zinc-500 mt-1">{a.desc}</div>
              <div className="mt-3 text-xs text-emerald-400">Active</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderIntegrations() {
    const keys = Object.keys(integrations);
    const bridge = bridgeStatus || {};
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Integration Status</h2>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">Alphonso Bridge</div>
              <div className="text-xs text-zinc-500 mt-1">ACC receiver health and latest packet truth.</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${bridge.status === 'configured' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
              {bridge.status || 'setup_required'}
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-3 mt-4 text-xs">
            <div className="rounded-lg bg-black/20 border border-white/[0.04] p-3">
              <div className="text-zinc-500 mb-1">Path</div>
              <div className="text-zinc-200 font-mono">{bridge.pathPrefix || '/api/alphonso-bridge'}</div>
            </div>
            <div className="rounded-lg bg-black/20 border border-white/[0.04] p-3">
              <div className="text-zinc-500 mb-1">Packets</div>
              <div className="text-zinc-200">{bridge.packetCount ?? 0}</div>
            </div>
            <div className="rounded-lg bg-black/20 border border-white/[0.04] p-3">
              <div className="text-zinc-500 mb-1">Latest</div>
              <div className="text-zinc-200">{bridge.lastPacketKind || 'none'}</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {keys.length === 0
            ? <div className="col-span-3 rounded-xl border border-white/[0.06] p-12 text-center text-zinc-600">Loading integrations...</div>
            : keys.map(k => {
                const v = integrations[k] || {};
                const connected = v.status === 'connected';
                return (
                  <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-white capitalize">{k}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-500/15 text-zinc-400'}`}>
                        {v.status || 'unknown'}
                      </span>
                    </div>
                    {v.note && <div className="text-xs text-zinc-600">{v.note}</div>}
                  </div>
                );
              })}
        </div>
      </div>
    );
  }

  const visibleWorkflows = workflows.filter(w => {
    const q = workflowFilter.trim().toLowerCase();
    if (!q) return true;
    return [
      w.key,
      w.id,
      w.name,
      w.kind,
      w.category,
      w.description,
      w.command,
      w.user_command,
    ].some(value => String(value || '').toLowerCase().includes(q));
  });

  const selectedWorkflowObj = workflows.find(w => w.key === selectedWorkflow || w.id === selectedWorkflow)
    || visibleWorkflows[0]
    || workflows[0]
    || null;

  async function handleLaunchWorkflow(workflow, inputOverride) {
    if (!workflow) return;
    setWorkflowBusy(true);
    setWorkflowError(null);
    setWorkflowNotice(`Launching ${workflow.name}...`);
    try {
      const response = await runWorkflow(workflow.key, {
        input: inputOverride || workflowInput,
        preferKind: workflow.kind,
        created_by: 'ui',
        approval_required: true,
        title: `[Workflow] ${workflow.name}`,
      });
      const result = response.result || response;
      setWorkflowLaunchResult(result);
      setWorkflowNotice(`Queued ${workflow.name}.`);
      await fetchAll();
    } catch (e) {
      setWorkflowError(e.message);
      setWorkflowNotice(null);
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function handleLaunchParallel() {
    const refs = parallelInput
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    if (!refs.length) {
      setWorkflowError('Enter at least one workflow key separated by commas.');
      return;
    }
    setWorkflowBusy(true);
    setWorkflowError(null);
    setWorkflowNotice(`Launching ${refs.length} workflows in parallel...`);
    try {
      const response = await runWorkflowParallel(refs, {
        input: workflowInput,
        created_by: 'ui',
        approval_required: true,
        batch_id: `ui-${Date.now()}`,
      });
      const result = response.result || response;
      setWorkflowLaunchResult(result);
      setWorkflowNotice(`Parallel batch queued: ${result.batch_id || 'unknown batch'}.`);
      await fetchAll();
    } catch (e) {
      setWorkflowError(e.message);
      setWorkflowNotice(null);
    } finally {
      setWorkflowBusy(false);
    }
  }

  function renderWorkflows() {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-white">Workflow Catalog</h2>
            <p className="text-sm text-zinc-500 mt-1">List, inspect, and launch workflows from ACC itself.</p>
          </div>
          <div className="text-xs text-zinc-500">
            {workflows.length} registered workflows
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={workflowFilter}
                onChange={e => setWorkflowFilter(e.target.value)}
                placeholder="Filter by name, key, category, or command"
                className="flex-1 min-w-[220px] rounded-lg border border-white/[0.08] bg-[#111114] px-3 py-2 text-sm text-white outline-none focus:border-white/[0.18]"
              />
              <button
                onClick={() => setWorkflowFilter('')}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06]"
              >
                Clear
              </button>
            </div>

            <div className="grid gap-3">
              {visibleWorkflows.map(workflow => {
                const active = selectedWorkflowObj && workflow.key === selectedWorkflowObj.key;
                return (
                  <div
                    key={workflow.key}
                    className={`rounded-xl border p-4 ${active ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-medium truncate">{workflow.name}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 uppercase tracking-wide">{workflow.kind}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 uppercase tracking-wide">{workflow.category}</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 font-mono">{workflow.key}</div>
                        {workflow.description && <div className="text-sm text-zinc-300 mt-2 leading-relaxed">{workflow.description}</div>}
                        {workflow.user_command && <div className="text-xs text-cyan-300 mt-2">Command: {workflow.user_command}</div>}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => setSelectedWorkflow(workflow.key)}
                          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.06]"
                        >
                          Select
                        </button>
                        <button
                          onClick={() => handleLaunchWorkflow(workflow)}
                          disabled={workflowBusy}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
                        >
                          Launch
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-black/20 border border-white/[0.04] p-3">
                        <div className="text-zinc-500 mb-1">Approval gates</div>
                        <div className="text-zinc-200">
                          {(workflow.approval_required_for && workflow.approval_required_for.length)
                            ? workflow.approval_required_for.join(', ')
                            : 'None'}
                        </div>
                      </div>
                      <div className="rounded-lg bg-black/20 border border-white/[0.04] p-3">
                        <div className="text-zinc-500 mb-1">Outputs</div>
                        <div className="text-zinc-200">
                          {(workflow.final_outputs && workflow.final_outputs.length)
                            ? workflow.final_outputs.slice(0, 3).join(', ')
                            : 'Workflow result'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {visibleWorkflows.length === 0 && (
                <div className="rounded-xl border border-white/[0.06] p-8 text-center text-zinc-500">
                  No workflows match this filter.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
              <div className="text-sm font-medium text-white">Launch Selected Workflow</div>
              <div className="text-xs text-zinc-500">Uses the registry entry and routes through the Task Bus.</div>

              <label className="block">
                <div className="text-[11px] text-zinc-500 mb-1">Selected workflow</div>
                <select
                  value={selectedWorkflow}
                  onChange={e => setSelectedWorkflow(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-[#111114] px-3 py-2 text-sm text-white outline-none focus:border-white/[0.18]"
                >
                  {workflows.map(workflow => (
                    <option key={workflow.key} value={workflow.key}>{workflow.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[11px] text-zinc-500 mb-1">Input</div>
                <textarea
                  value={workflowInput}
                  onChange={e => setWorkflowInput(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/[0.08] bg-[#111114] px-3 py-2 text-sm text-white outline-none focus:border-white/[0.18]"
                  placeholder="Describe the workflow input or role..."
                />
              </label>

              <button
                onClick={() => handleLaunchWorkflow(selectedWorkflowObj)}
                disabled={workflowBusy || !selectedWorkflowObj}
                className="w-full rounded-lg border border-cyan-500/30 bg-cyan-500 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-400 disabled:opacity-60"
              >
                {workflowBusy ? 'Launching...' : 'Launch Selected'}
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
              <div className="text-sm font-medium text-white">Parallel Batch</div>
              <div className="text-xs text-zinc-500">Comma-separated workflow keys for side-by-side execution.</div>
              <input
                value={parallelInput}
                onChange={e => setParallelInput(e.target.value)}
                placeholder="job_application_workflow, ai_app_factory_workflow"
                className="w-full rounded-lg border border-white/[0.08] bg-[#111114] px-3 py-2 text-sm text-white outline-none focus:border-white/[0.18]"
              />
              <button
                onClick={handleLaunchParallel}
                disabled={workflowBusy}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:opacity-60"
              >
                {workflowBusy ? 'Launching batch...' : 'Launch Parallel Batch'}
              </button>
            </div>

            {(workflowNotice || workflowError || workflowLaunchResult) && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
                <div className="text-sm font-medium text-white">Launch Status</div>
                {workflowNotice && <div className="text-sm text-cyan-300">{workflowNotice}</div>}
                {workflowError && <div className="text-sm text-red-400">{workflowError}</div>}
                {workflowLaunchResult && (
                  <pre className="max-h-72 overflow-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-300">
{JSON.stringify(workflowLaunchResult, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {selectedWorkflowObj && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2">
                <div className="text-sm font-medium text-white">Selected Workflow</div>
                <div className="text-sm text-zinc-300">{selectedWorkflowObj.name}</div>
                <div className="text-xs text-zinc-500 font-mono">{selectedWorkflowObj.key}</div>
                <div className="text-xs text-zinc-400">{selectedWorkflowObj.description}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Settings</h2>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-3">
          {['DEEPSEEK_API_KEY','TELEGRAM_BOT_TOKEN','OPENHANDS_URL','SUPABASE_URL','COMPOSIO_API_KEY'].map(k => (
            <div key={k} className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <span className="text-zinc-300 text-sm font-mono">{k}</span>
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">SET</span>
            </div>
          ))}
          <div className="pt-2 text-xs text-zinc-600">Values hidden for security. The desktop app starts the local backend automatically; Telegram still starts separately with <span className="font-mono">npm run cloud:telegram</span>.</div>
        </div>
      </div>
    );
  }

  const pages = { dashboard: renderDashboard, tasks: renderTasks, approvals: renderApprovals, workflows: renderWorkflows, agents: renderAgents, integrations: renderIntegrations, settings: renderSettings };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Sidebar */}
      <div className={`flex-shrink-0 flex flex-col transition-all duration-200 border-r border-white/[0.06] ${sidebar ? 'w-56' : 'w-16'}`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-white/[0.06]">
          <span className="text-lg">⚡</span>
          {sidebar && <span className="font-semibold text-sm">ACC v2</span>}
          <button onClick={() => setSidebar(!sidebar)} className="ml-auto text-zinc-500 hover:text-white text-xs">
            {sidebar ? '◀' : '▶'}
          </button>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${page === n.id ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'}`}>
              <span>{n.icon}</span>
              {sidebar && <span>{n.label}</span>}
              {sidebar && n.id === 'approvals' && pending.length > 0 && (
                <span className="ml-auto bg-amber-500 text-black text-xs px-1.5 py-0.5 rounded-full font-bold">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-white/[0.06] space-y-2">
          <StatusPill backend={backend} />
          {(backend.status === 'Failed' || backend.status === 'Offline') && window.electronAPI?.retryBackendStart && (
            <button
              onClick={() => window.electronAPI.retryBackendStart()}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.06]"
            >
              Retry backend start
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-6 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-500 capitalize">{page}</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{stats.total_tasks || 0} tasks</span>
            <span>·</span>
            <span>{stats.total_results || 0} results</span>
            <span>·</span>
            <span>@OurAccbot</span>
          </div>
        </div>
        {(pages[page] || renderDashboard)()}
      </div>
    </div>
  );
}
