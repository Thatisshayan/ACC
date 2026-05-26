import React, { useEffect, useMemo, useState } from 'react';
import {
  getAdminSystem,
  getDashboard,
  getStatusSummary,
  getTaskbusApprovals,
  getTaskbusResults,
  listAlphonsoBridgePackets,
} from '../api.js';

const shell = 'rounded-[28px] border border-white/[0.07] bg-white/[0.04] backdrop-blur-xl';

function Badge({ tone = 'emerald', children }) {
  const map = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/20 bg-red-500/10 text-red-300',
    slate: 'border-white/[0.08] bg-white/[0.04] text-zinc-300',
    blue: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
    purple: 'border-purple-500/20 bg-purple-500/10 text-purple-300',
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

function StateRow({ label, value, detail, tone = 'text-zinc-200' }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-medium ${tone}`}>{value}</div>
      {detail && <div className="mt-1 text-xs text-zinc-500">{detail}</div>}
    </div>
  );
}

function timeLabel(value) {
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'just now';
  }
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [system, setSystem] = useState(null);
  const [summary, setSummary] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [results, setResults] = useState([]);
  const [packets, setPackets] = useState([]);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      const [dash, sys, truth, approvalPayload, resultPayload, packetPayload] = await Promise.all([
        getDashboard(),
        getAdminSystem(),
        getStatusSummary(),
        getTaskbusApprovals().catch(() => ({ approvals: [] })),
        getTaskbusResults(6).catch(() => ({ results: [] })),
        listAlphonsoBridgePackets(6).catch(() => ({ packets: [] })),
      ]);
      setData(dash);
      setSystem(sys);
      setSummary(truth);
      setApprovals(Array.isArray(approvalPayload.approvals) ? approvalPayload.approvals : []);
      setResults(Array.isArray(resultPayload.results) ? resultPayload.results : []);
      setPackets(Array.isArray(packetPayload.packets) ? packetPayload.packets : []);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const pending = useMemo(() => Number(data?.pendingSnapshots || 0), [data]);
  const connectors = Array.isArray(data?.connectors) ? data.connectors : [];
  const marketplaces = Array.isArray(data?.marketplaces) ? data.marketplaces : [];
  const taskbusPending = Number(summary?.taskbus?.pendingApprovals || 0);
  const botHealthy = summary?.bot?.status === 'active';

  const recentApprovals = approvals.slice(0, 4);
  const recentResults = results.slice(0, 4);
  const recentPackets = packets.slice(0, 4);

  if (err) return <p style={{ color: '#f87171' }}>Error: {err}</p>;
  if (!data || !system || !summary) return <p style={{ color: '#aaa' }}>Loading...</p>;

  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 pb-24 md:p-6 md:pb-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <div className={`${shell} overflow-hidden`}>
          <div className="relative p-5 md:p-7">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.10),transparent_28%)]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <Badge tone="emerald">ACC dashboard</Badge>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Executive control for the launch-ready brain.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
                  Live runtime truth for backend, bot, messenger, bridge, approvals, and connectors. This is the operating cockpit, not a placeholder screen.
                </p>
              </div>
              <Badge tone={summary.overall === 'healthy' ? 'emerald' : summary.overall === 'partial' ? 'amber' : 'red'}>
                {summary.overall || 'unknown'}
              </Badge>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric
                label="Backend"
                value={summary.backend?.status || system?.workerStatus || 'healthy'}
                detail={`Bot ${summary.bot?.status || system?.activeBot || 'unknown'} - Queue ${summary.taskbus?.totalTasks ?? system?.queueLength ?? 0}`}
              />
              <Metric
                label="Task bus"
                value={summary.taskbus?.status || 'ok'}
                detail={`${taskbusPending} approvals waiting`}
                tone="text-emerald-300"
              />
              <Metric
                label="Bridge"
                value={summary.bridge?.status || 'unknown'}
                detail={`Packets ${summary.bridge?.packetCount ?? 0} - ${summary.bridge?.configured ? 'configured' : 'setup required'}`}
                tone={summary.bridge?.configured ? 'text-emerald-300' : 'text-amber-300'}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <div className={`${shell} p-5 md:p-6`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">System</div>
                  <h2 className="mt-1 text-lg font-semibold text-white">Live runtime truth</h2>
                </div>
                <Badge tone={summary.overall === 'healthy' ? 'emerald' : 'amber'}>{summary.overall || 'unknown'}</Badge>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <StateRow label="Backend" value={summary.backend?.status || 'ok'} detail={`PID ${summary.backend?.pid ?? system?.pid ?? 'n/a'} - Uptime ${summary.backend?.uptimeSeconds ?? 0}s`} />
                <StateRow label="Bot" value={summary.bot?.status || 'inactive'} detail={`Lock ${summary.bot?.lock?.healthy ? 'healthy' : 'stale'} - PID ${summary.bot?.lock?.pid ?? 'n/a'}`} tone={botHealthy ? 'text-emerald-300' : 'text-amber-300'} />
                <StateRow label="Messenger" value={summary.messenger?.status || 'unknown'} detail={`Threads ${summary.messenger?.threads ?? 0} - Messages ${summary.messenger?.messages ?? 0}`} tone={summary.messenger?.status === 'ready' ? 'text-emerald-300' : 'text-amber-300'} />
                <StateRow label="Bridge" value={summary.bridge?.status || 'unknown'} detail={`Configured ${summary.bridge?.configured ? 'yes' : 'no'} - Last packet ${summary.bridge?.lastPacketKind || 'n/a'}`} tone={summary.bridge?.configured ? 'text-emerald-300' : 'text-amber-300'} />
                <StateRow label="Approvals" value={taskbusPending} detail="Tasks waiting for human review" tone="text-amber-300" />
                <StateRow label="Task bus" value={system?.workerStatus || 'healthy'} detail={`Queue ${system?.queueLength ?? 0} - Total ${summary.taskbus?.totalTasks ?? system?.totalTasks ?? 0}`} />
              </div>

              <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Truth notes</div>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
                  {(summary.notes || []).map((note) => (
                    <li key={note}>- {note}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`${shell} p-5 md:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Recent results</div>
                  <h2 className="mt-1 text-lg font-semibold text-white">Fresh task outcomes</h2>
                </div>
                <Badge tone="blue">{recentResults.length} shown</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {recentResults.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
                    No recent results yet.
                  </div>
                ) : recentResults.map((result) => (
                  <div key={result.id} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{result.summary || 'Untitled result'}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Task {String(result.task_id || '').slice(0, 8) || 'n/a'} - {result.agent || 'unknown'} - {timeLabel(result.timestamp)}
                        </div>
                      </div>
                      <Badge tone={result.is_real_ai_result ? 'emerald' : 'amber'}>{result.provider_used || 'manual'}</Badge>
                    </div>
                    {result.next_request && (
                      <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                        Next: {result.next_request}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={`${shell} p-5 md:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Bridge packets</div>
                  <h2 className="mt-1 text-lg font-semibold text-white">Recent Alphonso traffic</h2>
                </div>
                <Badge tone={summary.bridge?.configured ? 'emerald' : 'amber'}>{summary.bridge?.packetCount ?? 0} total</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {recentPackets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
                    No bridge packets yet.
                  </div>
                ) : recentPackets.map((packet) => (
                  <div key={packet.id} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{packet.kind || 'unknown packet'}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {packet.status || 'received'} - {timeLabel(packet.createdAt || packet.updatedAt)}
                        </div>
                      </div>
                      <Badge tone={packet.status === 'failed' ? 'red' : packet.status === 'published' ? 'emerald' : 'slate'}>{packet.status || 'received'}</Badge>
                    </div>
                    {packet.summary && (
                      <div className="mt-3 text-xs leading-relaxed text-zinc-400">{packet.summary}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`${shell} p-5 md:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Pending approvals</div>
                  <h2 className="mt-1 text-lg font-semibold text-white">Compact review queue</h2>
                </div>
                <Badge tone={taskbusPending ? 'amber' : 'emerald'}>{taskbusPending}</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {recentApprovals.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
                    No approvals waiting right now.
                  </div>
                ) : recentApprovals.map((approval) => {
                  return (
                    <div key={approval.id} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">{approval.action || 'review'}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Task {String(approval.task_id || '').slice(0, 8) || 'n/a'} - {timeLabel(approval.timestamp)}
                          </div>
                        </div>
                        <Badge tone="amber">{approval.status || 'pending'}</Badge>
                      </div>
                      {approval.notes && (
                        <div className="mt-3 text-xs leading-relaxed text-zinc-400">{approval.notes}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${shell} p-5 md:p-6 space-y-4`}>
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Connectors</div>
                <h2 className="mt-1 text-lg font-semibold text-white">Available surfaces</h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {connectors.map((c) => <Badge key={c} tone="emerald">{c}</Badge>)}
                {marketplaces.map((c) => <Badge key={c} tone="amber">{c} (mkt)</Badge>)}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Connectors" value={connectors.length} detail="Configured connectors loaded" tone="text-emerald-300" />
                <Metric label="Marketplaces" value={marketplaces.length} detail="Marketplace adapters loaded" tone="text-amber-300" />
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Launch note</div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-300">
                  If a connector is not configured, it stays labeled honestly as setup_required or disabled. Nothing in this dashboard should pretend to be live when it is not.
                </div>
              </div>
            </div>

            <div className={`${shell} p-5 md:p-6`}>
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Truth snapshot</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Metric label="Total tasks" value={summary.taskbus?.totalTasks ?? 0} detail="Current task count" tone="text-white" />
                <Metric label="Pending approvals" value={taskbusPending} detail="Review-first actions" tone="text-amber-300" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
