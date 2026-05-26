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
import api from './api.js';
import MessengerPage from './pages/Messenger.jsx';
import AssistantPage from './pages/Assistant.jsx';
import AdminPage from './pages/Admin.jsx';

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
  { id: 'messages',     label: 'Messages',     icon: '💬' },
  { id: 'assistant',    label: 'Assistant',    icon: '🎙️' },
  { id: 'agents',       label: 'Agents',        icon: '🤖' },
  { id: 'integrations', label: 'Integrations',  icon: '🔗' },
  { id: 'admin',        label: 'Admin',         icon: '🛡️' },
  { id: 'settings',     label: 'Settings',      icon: '⚙️' },
];

const MOBILE_NAV = [
  { id: 'dashboard', label: 'Home', icon: '🏠' },
  { id: 'messages', label: 'Chat', icon: '💬' },
  { id: 'assistant', label: 'Talk', icon: '🎙️' },
  { id: 'approvals', label: 'Approve', icon: '✅' },
  { id: 'settings', label: 'More', icon: '⚙️' },
];

const PAGE_PATHS = new Set([
  'dashboard',
  'tasks',
  'approvals',
  'messages',
  'assistant',
  'agents',
  'integrations',
  'admin',
  'settings',
]);

function pathToPage(pathname) {
  const next = String(pathname || '').replace(/^\/+/, '').trim().toLowerCase();
  return PAGE_PATHS.has(next) ? next : 'dashboard';
}

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
  const [page, setPage]         = useState(() => (typeof window !== 'undefined' ? pathToPage(window.location.pathname) : 'dashboard'));
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

    const syncRoute = () => {
      if (typeof window === 'undefined') return;
      const nextPage = pathToPage(window.location.pathname);
      if (nextPage !== page) setPage(nextPage);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', syncRoute);
      syncRoute();
    }

    return () => {
      active = false;
      clearInterval(id);
      cleanupBackend();
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', syncRoute);
      }
    };
  }, [page]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = pathToPage(window.location.pathname);
    const nextPath = `/${page}`;
    if (current !== page || window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, [page]);

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
      <div className="p-4 sm:p-6 space-y-6">
        <Surface className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.15),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.13),transparent_30%)]" />
          <div className="relative p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Live control surface
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
                    ACC dashboard, but cleaner, calmer, and more premium.
                  </h2>
                  <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-zinc-400">
                    Monitor the brain, push work through approvals, and keep the SocialClaw publish lane visible without drowning in admin noise.
                  </p>
                </div>
              </div>
              <StatusPill backend={backend} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Backend</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-medium text-white">{backend.status}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">{backend.detail}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Approvals</div>
                <div className="mt-1 text-2xl font-semibold text-white">{pending.length}</div>
                <div className="text-xs text-zinc-500">Waiting review</div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Publish lane</div>
                <div className="mt-1 text-sm font-medium text-white">{socialclaw.status || 'setup_required'}</div>
                <div className="mt-1 text-xs text-zinc-500">{socialclaw.note || 'ACC to SocialClaw handoff'}</div>
              </div>
            </div>
          </div>
        </Surface>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Tasks"  value={stats.total_tasks || 0}       color="text-white" />
          <StatCard label="Completed"    value={byStatus.done || 0}            color="text-emerald-400" />
          <StatCard label="Failed"       value={byStatus.failed || 0}          color="text-red-400" />
          <StatCard label="Pending"      value={stats.pending_approvals || 0}  color="text-amber-400" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Surface className="p-5 sm:p-6">
            <SectionHeader
              eyebrow="Publishing lane"
              title="SocialClaw handoff"
              description="Plan in ACC, generate with Alphonso, review in ACC, then publish through SocialClaw. The lane stays truth-gated until the API key exists."
              action={<span className={`rounded-full border px-3 py-1 text-xs ${socialclawIsReady ? 'border-emerald-500/20 bg-emerald-500/12 text-emerald-300' : 'border-amber-500/20 bg-amber-500/12 text-amber-300'}`}>{socialclaw.status || 'setup_required'}</span>}
            />

            <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
              <div className="grid gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-zinc-200">1. ACC intake</div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-zinc-200">2. Alphonso generate</div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-zinc-200">3. ACC approval</div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-zinc-200">4. SocialClaw publish</div>
              </div>

              <textarea
                value={socialclawDraft}
                onChange={(e) => setSocialclawDraft(e.target.value)}
                rows={4}
                className="mt-4 w-full rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500/40 focus:bg-black/45"
                placeholder="Draft the social post here..."
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={launchSocialPublishPipeline} disabled={!!pipelineAction}
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
                  {pipelineAction === 'launching' ? 'Launching...' : 'Launch pipeline'}
                </button>
                <button onClick={() => handleSocialClaw('preview')} disabled={!!socialclawAction}
                  className="rounded-xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12 disabled:opacity-50">
                  {socialclawAction === 'preview' ? 'Previewing...' : 'Preview only'}
                </button>
                <button onClick={() => handleSocialClaw('validate')} disabled={!!socialclawAction}
                  className="rounded-xl border border-sky-500/25 bg-sky-500/12 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/18 disabled:opacity-50">
                  {socialclawAction === 'validate' ? 'Validating...' : 'Validate draft'}
                </button>
              </div>
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-xs leading-relaxed text-zinc-400">
                Publish remains truth-gated until <span className="font-mono text-zinc-200">SOCIALCLAW_API_KEY</span> is set.
              </div>
            </div>
          </Surface>

          <Surface className="p-5 sm:p-6">
            <SectionHeader
              eyebrow="Publisher inbox"
              title="Queued publish work"
              description="The publish lane should feel like a focused inbox, not a generic task table."
              action={<span className="text-xs text-zinc-500">{publisherInbox.length} items</span>}
            />
            <div className="mt-5 space-y-3">
              {publisherInbox.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/[0.10] bg-black/20 p-5 text-sm text-zinc-500">
                  No publish drafts queued yet. Launch the pipeline to create a draft task and publish handoff.
                </div>
              ) : publisherInbox.map((task) => {
                const meta = task.meta || {};
                return (
                  <div key={task.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{task.title || 'Untitled publish lane'}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {meta.workflow_stage || task.assigned_agent} - {task.status}
                        </div>
                      </div>
                      <Badge status={task.status} />
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">Updated {taskTime(task.created_at)}</div>
                    {meta.workflow_parent_task_id && (
                      <div className="mt-2 text-xs text-zinc-500">Parent task: {String(meta.workflow_parent_task_id).slice(0, 8)}</div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => setPage('tasks')}
                        className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-zinc-200 transition hover:bg-white/[0.12]"
                      >
                        Open task
                      </button>
                      {task.status === 'waiting_approval' && (
                        <button
                          onClick={() => setPage('approvals')}
                          className="rounded-xl border border-amber-500/25 bg-amber-500/12 px-3 py-2 text-xs text-amber-300 transition hover:bg-amber-500/18"
                        >
                          Review approval
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>

        <Surface>
          <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <SectionHeader
              eyebrow="Live feed"
              title="Recent tasks"
              description="A cleaner view of current work, with status and ownership up front."
            />
          </div>
          <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2 xl:grid-cols-3">
            {tasks.slice(0, 9).map((t) => (
              <div key={t.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 transition hover:border-white/[0.14] hover:bg-black/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{t.title || t.id?.slice(0, 12)}</div>
                    <div className="mt-1 text-xs text-zinc-500">{t.assigned_agent} - {t.created_by}</div>
                  </div>
                  <Badge status={t.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Created</div>
                    <div className="mt-1 text-zinc-300">{taskTime(t.created_at)}</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">State</div>
                    <div className="mt-1 text-zinc-300">{t.status}</div>
                  </div>
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-5 py-10 text-center text-sm text-zinc-500">
                No tasks yet. Send a task to @OurAccbot to get started.
              </div>
            )}
          </div>
        </Surface>
      </div>
    );
  }

  function renderTasks() {
    const statusGroups = [
      { key: 'waiting_approval', label: 'Waiting approval', tone: 'text-amber-300', bg: 'bg-amber-500/10' },
      { key: 'in_progress', label: 'In progress', tone: 'text-sky-300', bg: 'bg-sky-500/10' },
      { key: 'done', label: 'Done', tone: 'text-emerald-300', bg: 'bg-emerald-500/10' },
      { key: 'failed', label: 'Failed', tone: 'text-red-300', bg: 'bg-red-500/10' },
    ];
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <Surface className="p-5 sm:p-6">
          <SectionHeader
            eyebrow="Work inventory"
            title="All tasks"
            description="A calmer board for scanning work, not a dense admin table."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statusGroups.map((group) => {
              const count = tasks.filter((task) => task.status === group.key).length;
              return (
                <div key={group.key} className={`rounded-2xl border border-white/[0.08] ${group.bg} p-4`}>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{group.label}</div>
                  <div className={`mt-2 text-3xl font-semibold ${group.tone}`}>{count}</div>
                </div>
              );
            })}
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <span>Title</span>
              <span>Agent</span>
              <span>Status</span>
              <span>Created</span>
            </div>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {tasks.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-zinc-500">No tasks yet.</div>
            ) : (
              tasks.map((t, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-4 sm:px-6 hover:bg-white/[0.02]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{t.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">#{String(t.id || '').slice(0, 8)}</div>
                  </div>
                  <div className="text-sm text-zinc-400">{t.assigned_agent}</div>
                  <div><Badge status={t.status} /></div>
                  <div className="text-xs text-zinc-500">{taskTime(t.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </Surface>
      </div>
    );
  }

  function renderApprovals() {
    const approvalStats = {
      pending: pending.length,
      urgent: pending.filter((t) => t.priority === 'P0').length,
      waiting: pending.filter((t) => t.status === 'waiting_approval').length,
    };
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <Surface className="p-5 sm:p-6">
          <SectionHeader
            eyebrow="Decision queue"
            title={`Pending approvals (${pending.length})`}
            description="Every risky action should stay obvious, calm, and fast to review."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Pending" value={approvalStats.pending} detail="Items waiting for a human decision." icon="🛂" />
            <MetricCard label="Urgent" value={approvalStats.urgent} detail="P0 items that should stay in the spotlight." icon="⚡" />
            <MetricCard label="In queue" value={approvalStats.waiting} detail="Tasks currently blocked by approval." icon="🕒" />
          </div>
        </Surface>
        {pending.length === 0
          ? <Surface className="p-12 text-center text-zinc-500">No pending approvals.</Surface>
          : <div className="grid gap-4">{pending.map((t) => {
              const busy = approvalBusy.has(t.id);
              const msg  = approvalMsg[t.id];
              const meta = t.meta || {};
              const createdBy = meta.createdBy || t.created_by || 'unknown';
              const nodeId = meta.nodeId || meta.node_id || '—';
              return (
                <Surface key={t.id} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-lg font-medium text-white">{t.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Agent: {t.assigned_agent} - Task: {t.id?.slice(0,8)} - Node: {nodeId}
                      </div>
                    </div>
                    <Badge status={t.status} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-zinc-400">
                      <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Created</div>
                      <div className="mt-1 text-zinc-200">{taskTime(t.created_at)}</div>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-zinc-400">
                      <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Output</div>
                      <div className="mt-1 text-zinc-200">{t.outputSummary ? 'Ready to inspect' : 'No output summary'}</div>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-zinc-400">
                      <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Review mode</div>
                      <div className="mt-1 text-zinc-200">Human approval</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-xs leading-relaxed text-zinc-400">
                    <span className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Review context</span>
                    <div className="mt-2 text-zinc-200">
                      Created by {createdBy}. Keep this as a human decision point before any risky or external action.
                    </div>
                  </div>
                  {msg && (
                    <div className={`mt-4 rounded-xl px-3 py-2 text-xs ${msg.ok ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-300 bg-red-500/10 border border-red-500/20'}`}>
                      {msg.text}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() => handleApproval(t.id, 'approved')}
                      className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {busy ? '...' : 'Approve'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleApproval(t.id, 'rejected')}
                      className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/25 disabled:opacity-50"
                    >
                      {busy ? '...' : 'Reject'}
                    </button>
                  </div>
                </Surface>
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
              <div className="text-white font-medium">publish - socialclaw</div>
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
          <p className="text-xs text-zinc-500 mb-2">The desktop app starts the backend automatically. The Telegram bot runs 24/7 on Railway in webhook mode — no local process needed.</p>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            Bot is live on Railway. Set <span className="font-mono">TELEGRAM_BOT_MODE=local</span> in your env only if you want to run it locally instead.
          </div>
        </div>
      </div>
    );
  }

  const pages = {
    dashboard: renderDashboard,
    tasks: renderTasks,
    approvals: renderApprovals,
    messages: () => <MessengerPage />,
    assistant: () => <AssistantPage />,
    agents: renderAgents,
    integrations: renderIntegrations,
    admin: () => <AdminPage />,
    settings: renderSettings,
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Sidebar */}
      <div className={`hidden md:flex flex-shrink-0 flex-col transition-all duration-200 border-r border-white/[0.06] ${sidebar ? 'w-56' : 'w-16'}`}>
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
      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur border-b border-white/[0.06] px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebar((value) => !value)}
              className="hidden md:inline-flex rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.08]"
            >
              {sidebar ? 'Collapse' : 'Expand'}
            </button>
            <div className="min-w-0">
              <div className="text-xs text-zinc-500 uppercase tracking-[0.2em]">{page}</div>
              <div className="text-sm text-zinc-200 truncate">ACC mobile-first control surface</div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-xs text-zinc-500">
            <span>{stats.total_tasks || 0} tasks</span>
            <span>·</span>
            <span>{stats.total_results || 0} results</span>
            <span>·</span>
            <span>@OurAccbot</span>
          </div>
        </div>
        {(pages[page] || renderDashboard)()}
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-[#0a0a0f]/95 backdrop-blur px-2 py-2">
        <div className="grid grid-cols-5 gap-1">
          {MOBILE_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] transition-colors ${page === item.id ? 'bg-white/[0.10] text-white' : 'text-zinc-500'}`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="mt-1">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Surface({ className = '', children }) {
  return (
    <div className={`rounded-3xl border border-white/[0.08] bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">{eyebrow}</div>
        )}
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function MetricCard({ label, value, detail, accent = 'text-white', icon, tone = 'bg-white/[0.03]' }) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] ${tone} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className={`text-3xl font-semibold tracking-tight ${accent}`}>{value}</div>
          <div className="text-sm text-zinc-400">{label}</div>
        </div>
        {icon && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-2 text-lg leading-none text-zinc-200">
            {icon}
          </div>
        )}
      </div>
      {detail && <div className="mt-4 text-xs leading-relaxed text-zinc-500">{detail}</div>}
    </div>
  );
}

function taskTime(value) {
  if (!value) return 'just now';
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return 'just now';
  }
}
