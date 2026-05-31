import React, { useEffect, useState } from 'react';
import { getAuditTrail } from '../api.js';

const shell = 'rounded-[28px] border border-white/[0.07] bg-white/[0.04] backdrop-blur-xl';

const RESULT_STYLE = {
  ok:       'text-emerald-400',
  approved: 'text-emerald-400',
  failed:   'text-red-400',
  rejected: 'text-red-400',
};

function timeLabel(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState('');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await getAuditTrail();
      setEntries(Array.isArray(data) ? data : (data?.entries || []));
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = filter
    ? entries.filter(e => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase()))
    : entries;

  const reversed = [...visible].reverse();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 pb-24 md:p-6 md:pb-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">

        {/* Header */}
        <div className={`${shell} overflow-hidden`}>
          <div className="relative p-5 md:p-7">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_38%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                  Audit trail
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  Security &amp; Action Log
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  All recorded security events and agent actions. Newest first.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-zinc-500 border border-white/[0.06] rounded-xl px-3 py-1.5">
                  {visible.length} entries
                </span>
                <button onClick={load}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.08] transition-colors">
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by actor, action, node…"
          className="w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-white/20 placeholder-zinc-600"
        />

        {/* Error */}
        {err && (
          <div className={`${shell} p-6 text-center`}>
            <div className="text-red-400 text-sm font-medium mb-2">Failed to load audit trail</div>
            <div className="text-xs text-zinc-600 mb-4">{err}</div>
            <button onClick={load}
              className="px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs text-zinc-300 hover:bg-white/[0.08] transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && !err && (
          <div className={`${shell} p-10 text-center text-zinc-500 text-sm`}>
            Loading audit trail…
          </div>
        )}

        {/* Empty */}
        {!loading && !err && reversed.length === 0 && (
          <div className={`${shell} p-12 text-center`}>
            <div className="text-3xl mb-3 opacity-30">🔍</div>
            <div className="text-sm text-zinc-500 font-medium">
              {filter ? 'No entries match that filter.' : 'No audit events recorded yet.'}
            </div>
            <div className="text-xs text-zinc-700 mt-1">
              Events are logged as agents take actions and approvals are processed.
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && !err && reversed.length > 0 && (
          <div className={`${shell} overflow-hidden`}>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1fr_2fr_1fr] gap-4 px-5 py-3 border-b border-white/[0.06] text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              <span>Time</span>
              <span>Actor</span>
              <span>Action / Node</span>
              <span>Result</span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {reversed.map((e, i) => (
                <div key={e.id || i}
                  className="grid grid-cols-[1fr_1fr_2fr_1fr] gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <span className="text-[11px] text-zinc-600 font-mono self-center">
                    {timeLabel(e.timestamp)}
                  </span>
                  <span className="text-xs text-zinc-400 self-center truncate">
                    {e.actor || e.agent || e.agentType || '—'}
                  </span>
                  <div className="min-w-0 self-center">
                    <div className="text-xs text-zinc-200 truncate">
                      {e.action || e.event || e.actorRole || '—'}
                    </div>
                    {(e.nodeId || e.target) && (
                      <div className="text-[11px] text-zinc-600 font-mono truncate mt-0.5">
                        {e.nodeId || e.target}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs self-center font-medium ${
                    RESULT_STYLE[e.result || e.status] || 'text-zinc-500'
                  }`}>
                    {e.result || e.status || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
