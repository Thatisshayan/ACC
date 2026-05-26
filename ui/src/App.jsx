import React, { useState, useEffect } from 'react';
import {
  getTaskbusStats,
  getTaskbusTasks,
  getTaskbusIntegrations,
  listAgents,
  createTask,
  listWorkflows,
  runWorkflow,
  runWorkflowParallel,
  getAlphonsoBridgeStatus,
  listAlphonsoBridgePackets,
  getSocialclawAccounts,
  getSocialclawUsage,
  previewSocialclawCampaign,
  validateSocialclawCampaign,
  publishSocialclawCampaign,
  deleteSocialclawPost,
} from './api.js';

// In Electron the UI loads from file:// so relative URLs won't reach the backend.
// In browser (dev+prod) use relative paths so Vite proxy / Express serve correctly.
const API = (typeof window !== 'undefined' && window.electronAPI) ? 'http://localhost:4000' : '';
const DEFAULT_BACKEND_STATUS = {
  status: 'Offline',
  detail: 'Checking backend...',
  lastCheckedAt: null,
};

const AGENT_ICONS = {
  chatgpt: '🧠', claude: '✳️', gemini: '💎', notebooklm: '📓',
  clickup: '📋', crewai: '👥', replicate_video: '🎬',
  openhands: '🤝', aider: '⚡', devika: '🤖', alphonso: '🦙',
  composio: '🔌', perplexity: '🔍', deepseek: '🧬',
};

const NAV = [
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
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-zinc-500 text-sm mt-1">{label}</div>
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

export default function App() {
  const [page, setPage]         = useState('dashboard');
  const [sidebar, setSidebar]   = useState(true);
  const [stats, setStats]       = useState({});
  const [tasks, setTasks]       = useState([]);
  const [integrations, setInt]  = useState({});
  const [backend, setBackend]   = useState(DEFAULT_BACKEND_STATUS);
  const [approvalBusy, setApprovalBusy] = useState(new Set());
  const [approvalMsg, setApprovalMsg]   = useState({});
  const [agents, setAgents]             = useState([]);
  const [socialclawDraft, setSocialclawDraft] = useState(
    'ACC + SocialClaw publish lane: preview a polished social post about the latest workflow and bridge updates.'
  );
  const [socialclawAction, setSocialclawAction] = useState('');
  const [socialclawResult, setSocialclawResult] = useState(null);
  const [socialclawError, setSocialclawError] = useState('');
  const [pipelineAction, setPipelineAction] = useState('');

  async function fetchAll() {
    const [s, t, i, a] = await Promise.all([
      getTaskbusStats().catch(() => ({})),
      getTaskbusTasks().catch(() => ({ tasks: [] })),
      getTaskbusIntegrations().catch(() => ({})),
      listAgents().catch(() => ({ agents: [] })),
    ]);

    setStats(s.stats || s || {});
    setTasks(Array.isArray(t.tasks) ? t.tasks : Array.isArray(t) ? t : []);
    setInt(i.integrations || {});
    setAgents(Array.isArray(a.agents) ? a.agents : []);
  }

  async function handleApproval(taskId, decision) {
    setApprovalBusy(prev => new Set(prev).add(taskId));
    setApprovalMsg(prev => ({ ...prev, [taskId]: null }));
    try {
      await api.post(`/taskbus/approval/${taskId}`, { decision });
      setApprovalMsg(prev => ({ ...prev, [taskId]: { ok: true, text: decision === 'approved' ? 'Approved' : 'Rejected' } }));
      await fetchAll();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Request failed';
      setApprovalMsg(prev => ({ ...prev, [taskId]: { ok: false, text: msg } }));
    } finally {
      setApprovalBusy(prev => { const s = new Set(prev); s.delete(taskId); return s; });
    }
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
              ? { status: 'Online', detail: 'Backend reachable.', lastCheckedAt: new Date().toISOString() }
              : { status: 'Offline', detail: 'Backend not reachable.', lastCheckedAt: new Date().toISOString() }
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
  const socialclaw = integrations.socialclaw || {};
  const socialclawIsReady = socialclaw.status === 'connected';
  const publisherInbox = tasks.filter((task) => {
    const meta = task.meta || {};
    return task.assigned_agent === 'socialclaw'
      || meta.workflow_key === 'acc:social_publish_pipeline'
      || meta.workflow_stage === 'publish'
      || meta.workflow_stage === 'generate';
  }).slice(0, 4);

  async function handleSocialClaw(action) {
    setSocialclawAction(action);
    setSocialclawError('');
    try {
      const payload = {
        source: 'acc-ui',
        title: 'ACC social publish lane',
        content: socialclawDraft,
        caption: socialclawDraft,
        platform: 'social',
        lane: 'publish',
      };

      let result;
      if (action === 'accounts') {
        result = await getSocialclawAccounts();
      } else if (action === 'usage') {
        result = await getSocialclawUsage();
      } else if (action === 'validate') {
        result = await validateSocialclawCampaign(payload);
      } else if (action === 'publish') {
        result = await publishSocialclawCampaign(payload);
      } else if (action === 'delete') {
        result = await deleteSocialclawPost(payload);
      } else {
        result = await previewSocialclawCampaign(payload);
      }

      setSocialclawResult(result);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'SocialClaw action failed';
      setSocialclawError(message);
      setSocialclawResult(null);
    } finally {
      setSocialclawAction('');
    }
  }

  async function launchSocialPublishPipeline() {
    setPipelineAction('launching');
    setSocialclawError('');
    try {
      const payload = {
        title: 'ACC Social Draft Pipeline',
        instruction: 'Draft a professional social post about ACC workflow orchestration and the SocialClaw handoff.',
        assigned_agent: 'alphonso',
        priority: 'high',
        required_output: 'Social-ready draft and handoff',
        approval_required: false,
        automation_mode: 'semi_auto',
        feature_ref: 'workflow:acc:social_publish_pipeline',
        created_by: 'chatgpt',
        meta: {
          workflow_key: 'acc:social_publish_pipeline',
          workflow_kind: 'publishing_pipeline',
          workflow_stage: 'generate',
          workflow_target_connector: 'socialclaw',
          workflow_input: socialclawDraft,
        },
      };
      const result = await createTask(payload);
      setSocialclawResult(result);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Pipeline launch failed';
      setSocialclawError(message);
      setSocialclawResult(null);
    } finally {
      setPipelineAction('');
    }
  }

  function renderDashboard() {
    const byStatus = stats.by_status || {};
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Dashboard</h2>
          <StatusPill backend={backend} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Tasks"  value={stats.total_tasks || 0}       color="text-white" />
          <StatCard label="Completed"    value={byStatus.done || 0}            color="text-emerald-400" />
          <StatCard label="Failed"       value={byStatus.failed || 0}          color="text-red-400" />
          <StatCard label="Pending"      value={stats.pending_approvals || 0}  color="text-amber-400" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">ACC Social Publish Pipeline</div>
                <div className="text-xs text-zinc-500 mt-1">Plan with ACC, generate with Alphonso, then approve and publish via SocialClaw.</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${socialclawIsReady ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border-amber-500/20'}`}>
                {socialclaw.status || 'setup_required'}
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="px-2 py-1 rounded-full bg-white/5 text-zinc-200">1. ACC intake</span>
                <span>→</span>
                <span className="px-2 py-1 rounded-full bg-white/5 text-zinc-200">2. Alphonso generate</span>
                <span>→</span>
                <span className="px-2 py-1 rounded-full bg-white/5 text-zinc-200">3. ACC review</span>
                <span>→</span>
                <span className="px-2 py-1 rounded-full bg-white/5 text-zinc-200">4. SocialClaw publish</span>
              </div>
              <textarea
                value={socialclawDraft}
                onChange={(e) => setSocialclawDraft(e.target.value)}
                rows={4}
                className="mt-4 w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500/40"
                placeholder="Draft the social post here..."
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={launchSocialPublishPipeline} disabled={!!pipelineAction}
                  className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                  {pipelineAction === 'launching' ? 'Launching...' : 'Launch pipeline'}
                </button>
                <button onClick={() => handleSocialClaw('preview')} disabled={!!socialclawAction}
                  className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm text-white hover:bg-white/15 disabled:opacity-50">
                  {socialclawAction === 'preview' ? 'Previewing...' : 'Preview only'}
                </button>
                <button onClick={() => handleSocialClaw('validate')} disabled={!!socialclawAction}
                  className="px-3 py-2 rounded-lg bg-sky-500/15 border border-sky-500/25 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
                  {socialclawAction === 'validate' ? 'Validating...' : 'Validate draft'}
                </button>
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                Publish remains truth-gated until <span className="font-mono text-zinc-200">SOCIALCLAW_API_KEY</span> is set.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-white">Publisher Inbox</div>
              <div className="text-xs text-zinc-500">{publisherInbox.length} items</div>
            </div>
            <div className="mt-4 space-y-3">
              {publisherInbox.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 text-sm text-zinc-500">
                  No publish drafts queued yet. Launch the pipeline to create a draft task and publish handoff.
                </div>
              ) : publisherInbox.map((task) => {
                const meta = task.meta || {};
                return (
                  <div key={task.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-white">{task.title || 'Untitled publish lane'}</div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {meta.workflow_stage || task.assigned_agent} · {task.status}
                        </div>
                      </div>
                      <Badge status={task.status} />
                    </div>
                    {meta.workflow_parent_task_id && (
                      <div className="mt-2 text-xs text-zinc-500">Parent task: {String(meta.workflow_parent_task_id).slice(0, 8)}</div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setPage('tasks')}
                        className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs text-zinc-200 hover:bg-white/15"
                      >
                        Open task
                      </button>
                      {task.status === 'waiting_approval' && (
                        <button
                          onClick={() => setPage('approvals')}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-xs text-amber-300 hover:bg-amber-500/20"
                        >
                          Review approval
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-medium text-white">Live Task Feed</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {tasks.slice(0, 10).map((t, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm text-zinc-200">{t.title || t.id?.slice(0,12)}</div>
                  <div className="text-xs text-zinc-600">{t.assigned_agent} · {t.created_by}</div>
                </div>
                <Badge status={t.status} />
              </div>
            ))}
            {tasks.length === 0 && <div className="px-5 py-8 text-center text-zinc-600 text-sm">No tasks yet. Send a task to @OurAccbot to get started.</div>}
          </div>
        </div>
      </div>
    );
  }

  function renderTasks() {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white mb-4">All Tasks</h2>
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04]">
              <tr>{['Title','Agent','Status','Created'].map(h => <th key={h} className="text-left px-4 py-3 text-zinc-400 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {tasks.map((t, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-zinc-200 max-w-xs truncate">{t.title}</td>
                  <td className="px-4 py-3 text-zinc-400">{t.assigned_agent}</td>
                  <td className="px-4 py-3"><Badge status={t.status} /></td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderApprovals() {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Pending Approvals <span className="text-amber-400">({pending.length})</span></h2>
        {pending.length === 0
          ? <div className="rounded-xl border border-white/[0.06] p-12 text-center text-zinc-600">No pending approvals.</div>
          : <div className="grid gap-4">{pending.map((t) => {
              const busy = approvalBusy.has(t.id);
              const msg  = approvalMsg[t.id];
              return (
                <div key={t.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <div className="font-medium text-white mb-1">{t.title}</div>
                  <div className="text-xs text-zinc-500 mb-3">Agent: {t.assigned_agent} · Task: {t.id?.slice(0,8)}</div>
                  {msg && (
                    <div className={`text-xs mb-3 px-2 py-1 rounded ${msg.ok ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                      {msg.text}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => handleApproval(t.id, 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {busy ? '...' : 'Approve'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleApproval(t.id, 'rejected')}
                      className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/25 disabled:opacity-50"
                    >
                      {busy ? '...' : 'Reject'}
                    </button>
                  </div>
                </div>
              );
            })}</div>
        }
      </div>
    );
  }

  function renderAgents() {
    const providerDot = (s) => {
      if (s === 'connected') return 'bg-emerald-400';
      if (s === 'error')     return 'bg-red-400';
      if (s === 'disabled')  return 'bg-zinc-600';
      return 'bg-amber-400';
    };
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-white">Agent Roster</h2>
          <span className="text-xs text-zinc-500">{agents.length} registered</span>
        </div>

        {agents.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] p-12 text-center text-zinc-600">
            Loading agents…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(a => (
              <div key={a.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-2xl">{AGENT_ICONS[a.id] || '🤖'}</span>
                  <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${providerDot(a.provider_status)}`} title={a.provider_status || 'unknown'} />
                </div>
                <div className="font-medium text-white">{a.name}</div>
                <div className="text-xs text-zinc-500 mt-1">{a.role}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${a.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 bg-zinc-800 text-zinc-500'}`}>
                    {a.enabled ? 'enabled' : 'disabled'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.08] bg-black/20 text-zinc-400">
                    {a.automation_mode}
                  </span>
                  {a.provider_note && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 truncate max-w-full">
                      {a.provider_note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderIntegrations() {
    const keys = Object.keys(integrations);
    return (
      <div className="p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Integration Status</h2>
            <div className="text-xs text-zinc-500 mt-1">
              ACC keeps the brain and governance. SocialClaw sits in the publish lane as the social execution adapter.
            </div>
          </div>
          <div className={`text-xs px-2 py-1 rounded-full border ${socialclawIsReady ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border-amber-500/20'}`}>
            SocialClaw lane: {socialclaw.status || 'unknown'}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 mb-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-white">SocialClaw Publisher</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${socialclawIsReady ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'}`}>
                  {socialclaw.status || 'unknown'}
                </span>
              </div>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                This lane previews, validates, and publishes social content through SocialClaw while ACC keeps approvals, memory, and workflow control. Publish is still truth-gated: if <span className="font-mono text-zinc-200">SOCIALCLAW_API_KEY</span> is missing, the connector stays <span className="font-mono text-zinc-200">setup_required</span>.
              </p>
              {socialclaw.note && <div className="text-xs text-zinc-500 mt-2">{socialclaw.note}</div>}
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-zinc-400 min-w-[220px]">
              <div className="text-zinc-500 uppercase tracking-[0.2em] text-[10px] mb-2">Workflow lane</div>
              <div className="text-white font-medium">publish → socialclaw</div>
              <div className="mt-1">Approval gate: publish actions should remain review-first in ACC.</div>
            </div>
          </div>

          <textarea
            value={socialclawDraft}
            onChange={(e) => setSocialclawDraft(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500/40"
            placeholder="Draft content for SocialClaw..."
          />

          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleSocialClaw('preview')} disabled={!!socialclawAction}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm text-white hover:bg-white/15 disabled:opacity-50">
              {socialclawAction === 'preview' ? 'Previewing...' : 'Preview'}
            </button>
            <button onClick={() => handleSocialClaw('validate')} disabled={!!socialclawAction}
              className="px-3 py-2 rounded-lg bg-sky-500/15 border border-sky-500/25 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
              {socialclawAction === 'validate' ? 'Validating...' : 'Validate'}
            </button>
            <button onClick={() => handleSocialClaw('accounts')} disabled={!!socialclawAction}
              className="px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-sm text-zinc-200 hover:bg-zinc-700/60 disabled:opacity-50">
              {socialclawAction === 'accounts' ? 'Loading...' : 'Accounts'}
            </button>
            <button onClick={() => handleSocialClaw('usage')} disabled={!!socialclawAction}
              className="px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/10 text-sm text-zinc-200 hover:bg-zinc-700/60 disabled:opacity-50">
              {socialclawAction === 'usage' ? 'Loading...' : 'Usage'}
            </button>
            <button onClick={() => handleSocialClaw('publish')} disabled={!!socialclawAction}
              className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
              {socialclawAction === 'publish' ? 'Publishing...' : 'Publish'}
            </button>
            <button onClick={() => handleSocialClaw('delete')} disabled={!!socialclawAction}
              className="px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/25 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50">
              {socialclawAction === 'delete' ? 'Deleting...' : 'Delete Post'}
            </button>
          </div>

          {socialclawError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {socialclawError}
            </div>
          )}

          {socialclawResult && (
            <pre className="max-h-72 overflow-auto rounded-xl border border-white/[0.08] bg-black/35 p-4 text-xs text-zinc-300 whitespace-pre-wrap">
              {JSON.stringify(socialclawResult, null, 2)}
            </pre>
          )}
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

  function renderSettings() {
    const intKeys = Object.keys(integrations);
    const statusColor = (s) => {
      if (s === 'connected')  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      if (s === 'disabled')   return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
      if (s === 'error')      return 'text-red-400 bg-red-500/10 border-red-500/20';
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    };
    return (
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <p className="text-xs text-zinc-500 mt-1">Live integration health from the backend. Values are never sent to the browser.</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-medium text-white">Integration Health</span>
          </div>
          {intKeys.length === 0 ? (
            <div className="px-5 py-8 text-center text-zinc-600 text-sm">Loading…</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {intKeys.map(k => {
                const v = integrations[k] || {};
                return (
                  <div key={k} className="flex items-center justify-between px-5 py-3 gap-4">
                    <div className="min-w-0">
                      <span className="text-sm text-zinc-200 capitalize">{k}</span>
                      {v.note && <span className="ml-2 text-xs text-zinc-600">{v.note}</span>}
                      {v.error && <span className="ml-2 text-xs text-red-500 truncate">{v.error}</span>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border flex-shrink-0 ${statusColor(v.status)}`}>
                      {v.status || 'unknown'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="text-sm font-medium text-white mb-3">Startup</div>
          <p className="text-xs text-zinc-500">Desktop app starts the backend automatically. Telegram bot starts separately:</p>
          <code className="mt-2 block text-xs text-cyan-300 bg-black/30 rounded px-3 py-2">npm run cloud:telegram</code>
        </div>
      </div>
    );
  }

  const pages = { dashboard: renderDashboard, tasks: renderTasks, approvals: renderApprovals, agents: renderAgents, integrations: renderIntegrations, settings: renderSettings };

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
