import React, { useEffect, useMemo, useState } from 'react';
import { approveSnapshot, listSnapshots, rejectSnapshot } from '../api.js';

const shell = 'rounded-[28px] border border-white/[0.07] bg-white/[0.04] backdrop-blur-xl';

function formatTime(value) {
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'just now';
  }
}

function Badge({ tone = 'amber', children }) {
  const map = {
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    red: 'border-red-500/20 bg-red-500/10 text-red-300',
    slate: 'border-white/[0.08] bg-white/[0.04] text-zinc-300',
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${map[tone] || map.slate}`}>
      {children}
    </span>
  );
}

function Metric({ label, value, detail, tone = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
      {detail && <div className="mt-1 text-xs text-zinc-500">{detail}</div>}
    </div>
  );
}

export default function Approvals() {
  const [snaps, setSnaps] = useState([]);
  const [busy, setBusy] = useState({});
  const [message, setMessage] = useState({});
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await listSnapshots();
      setSnaps(Array.isArray(data.snapshots) ? data.snapshots : []);
    } catch {
      setSnaps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function handle(id, decision) {
    setBusy((prev) => ({ ...prev, [id]: decision }));
    setMessage((prev) => ({ ...prev, [id]: null }));
    try {
      if (decision === 'approve') {
        await approveSnapshot(id);
      } else {
        if (!confirm('Reject and delete this snapshot?')) return;
        await rejectSnapshot(id);
      }
      setMessage((prev) => ({ ...prev, [id]: { ok: true, text: decision === 'approve' ? 'Approved' : 'Rejected' } }));
      await load();
    } catch (err) {
      setMessage((prev) => ({ ...prev, [id]: { ok: false, text: err.message || 'Request failed' } }));
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  const pending = useMemo(() => snaps.filter((snap) => snap.pendingApproval), [snaps]);
  const pendingCount = pending.length;
  const urgentCount = pending.filter((snap) => String(snap.meta?.taskPriority || snap.meta?.priority || '').toUpperCase() === 'P0').length;

  if (loading) {
    return <div className="p-6 text-zinc-400">Loading approvals...</div>;
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 pb-24 md:p-6 md:pb-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <div className={`${shell} overflow-hidden`}>
          <div className="relative p-5 md:p-7">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.10),transparent_28%)]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200">
                  Decision queue
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Review risky actions with calm, obvious context.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
                  Approvals stay crisp, readable, and human-led. Each card shows what is waiting, why it is waiting, and what happens next.
                </p>
              </div>
              <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1">
                <Metric label="Pending" value={pendingCount} detail="Items waiting for review" tone="text-amber-300" />
                <Metric label="Urgent" value={urgentCount} detail="P0 items that should stay visible" tone="text-white" />
                <Metric label="State" value={pendingCount ? 'Review needed' : 'Clear'} detail={pendingCount ? 'There is work to approve.' : 'No approvals waiting right now.'} tone="text-emerald-300" />
              </div>
            </div>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className={`${shell} p-10 text-center text-zinc-500`}>
            No pending approvals.
          </div>
        ) : (
          <div className="grid gap-4">
            {pending.map((snap) => {
              const meta = snap.meta || {};
              const text = message[snap.id];
              const currentBusy = busy[snap.id];
              return (
                <div key={snap.id} className={`${shell} p-5 md:p-6`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="amber">Pending</Badge>
                        <Badge tone="slate">#{String(snap.id || '').slice(0, 8)}</Badge>
                        {meta.nodeId && <Badge tone="slate">Node {String(meta.nodeId).slice(0, 8)}</Badge>}
                      </div>
                      <div className="text-lg font-semibold text-white">{snap.title || 'Untitled approval'}</div>
                      <div className="text-sm text-zinc-400">
                        Agent: <span className="text-zinc-200">{snap.meta?.createdBy || 'unknown'}</span> - Task: <span className="text-zinc-200">{snap.meta?.taskId || 'n/a'}</span>
                      </div>
                      <div className="text-xs text-zinc-500">{formatTime(snap.createdAt)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handle(snap.id, 'approve')}
                        disabled={Boolean(currentBusy)}
                        className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-50"
                      >
                        {currentBusy === 'approve' ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handle(snap.id, 'reject')}
                        disabled={Boolean(currentBusy)}
                        className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
                      >
                        {currentBusy === 'reject' ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </div>

                  {snap.outputSummary && (
                    <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/25 p-4">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Output summary</div>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-emerald-200">
                        {snap.outputSummary}
                      </pre>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 text-zinc-400">
                      <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Context</div>
                      <div className="mt-1 text-zinc-200">{meta.workflow_stage || meta.workflow_key || 'approval gate'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 text-zinc-400">
                      <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Task</div>
                      <div className="mt-1 text-zinc-200">{meta.taskId || 'n/a'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 text-zinc-400">
                      <div className="uppercase tracking-[0.18em] text-[10px] text-zinc-600">Review note</div>
                      <div className="mt-1 text-zinc-200">Keep approval human-led before external actions.</div>
                    </div>
                  </div>

                  {text && (
                    <div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${text.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-red-500/20 bg-red-500/10 text-red-200'}`}>
                      {text.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
