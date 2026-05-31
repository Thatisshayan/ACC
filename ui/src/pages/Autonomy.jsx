import React, { useState, useEffect } from 'react';
import { RefreshCw, Play, Pause, PlusCircle, Clock, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { getRuntimeApiBaseUrl } from '../lib/api.js';

const API = getRuntimeApiBaseUrl();

function Card({ className = '', children }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-[#0c0c18] ${className}`}>
      {children}
    </div>
  );
}

function intervalLabel(ms) {
  if (!ms) return '—';
  if (ms < 60000) return `${ms / 1000}s`;
  if (ms < 3600000) return `${ms / 60000}m`;
  if (ms < 86400000) return `${ms / 3600000}h`;
  return `${ms / 86400000}d`;
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const AGENTS = ['alphonso', 'claude', 'chatgpt', 'gemini', 'deepseek'];
const INTERVALS = [
  { label: '15 min',  ms: 900000 },
  { label: '1 hour',  ms: 3600000 },
  { label: '6 hours', ms: 21600000 },
  { label: '12 hours',ms: 43200000 },
  { label: '24 hours',ms: 86400000 },
];

const BLANK = { name: '', goal: '', agent: 'alphonso', interval_ms: 3600000 };

export default function AutonomyPage() {
  const [loops, setLoops]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(BLANK);
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedLoop, setSelectedLoop] = useState(null);
  const [runs, setRuns]       = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);

  async function fetchLoops() {
    setLoading(true);
    try {
      const res = await fetch(API + '/api/loops');
      const d = await res.json();
      setLoops(d.loops || []);
    } catch { setLoops([]); }
    setLoading(false);
  }

  useEffect(() => { fetchLoops(); }, []);

  async function toggleLoop(id, enabled) {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await fetch(API + `/api/loops/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await fetchLoops();
    } catch {}
    setBusy(b => ({ ...b, [id]: false }));
  }

  async function deleteLoop(id) {
    if (!confirm('Delete this loop?')) return;
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await fetch(API + `/api/loops/${id}`, { method: 'DELETE' });
      await fetchLoops();
      if (selectedLoop?.id === id) { setSelectedLoop(null); setRuns([]); }
    } catch {}
    setBusy(b => ({ ...b, [id]: false }));
  }

  async function createLoop() {
    if (!form.name.trim() || !form.goal.trim()) { setFormError('Name and goal are required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(API + '/api/loops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Create failed');
      setShowForm(false);
      setForm(BLANK);
      await fetchLoops();
    } catch(e) {
      setFormError(e.message);
    }
    setSaving(false);
  }

  async function loadRuns(loop) {
    setSelectedLoop(loop);
    setRunsLoading(true);
    try {
      const res = await fetch(API + `/api/loops/${loop.id}/runs`);
      const d = await res.json();
      setRuns(d.runs || []);
    } catch { setRuns([]); }
    setRunsLoading(false);
  }

  return (
    <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Background Automation</div>
          <h2 className="text-xl font-bold text-white">Autonomy Loops</h2>
          <p className="text-xs text-zinc-600 mt-1">Recurring agent tasks that run on a schedule without manual triggers.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLoops} className="w-8 h-8 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all">
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setFormError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1aff8c]/25 bg-[#1aff8c]/8 text-xs font-semibold text-[#1aff8c] hover:bg-[#1aff8c]/15 transition-all"
          >
            <PlusCircle size={12} />
            Add Loop
          </button>
        </div>
      </div>

      {/* Add loop form */}
      {showForm && (
        <Card className="p-5">
          <div className="text-sm font-semibold text-white mb-4">New Autonomy Loop</div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[11px] text-zinc-500 mb-1 block">Loop name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Daily news digest"
                className="w-full rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1 block">Agent</label>
              <select
                value={form.agent}
                onChange={e => setForm(f => ({ ...f, agent: e.target.value }))}
                className="w-full rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-sm text-zinc-300 outline-none"
              >
                {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1 block">Interval</label>
              <select
                value={form.interval_ms}
                onChange={e => setForm(f => ({ ...f, interval_ms: Number(e.target.value) }))}
                className="w-full rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-sm text-zinc-300 outline-none"
              >
                {INTERVALS.map(i => <option key={i.ms} value={i.ms}>{i.label}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[11px] text-zinc-500 mb-1 block">Goal / instruction</label>
            <textarea
              value={form.goal}
              onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
              placeholder="e.g. Search for top AI news, summarize the 5 most important stories, send via Telegram"
              rows={2}
              className="w-full rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none"
            />
          </div>
          {formError && <div className="mb-3 text-xs text-red-400">{formError}</div>}
          <div className="flex gap-2">
            <button onClick={createLoop} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1aff8c]/25 bg-[#1aff8c]/8 text-xs font-semibold text-[#1aff8c] disabled:opacity-40 transition-all">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              {saving ? 'Saving…' : 'Create Loop'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs text-zinc-500 hover:text-zinc-300 transition-all">
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* Loop list */}
      {loading ? (
        <Card className="flex items-center justify-center py-12 text-zinc-600 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" /> Loading loops…
        </Card>
      ) : loops.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <Clock size={28} className="mb-3 opacity-40" />
          <div className="text-sm font-medium text-zinc-500">No autonomy loops yet</div>
          <div className="text-xs mt-1 text-zinc-700">Add a loop to run tasks on a recurring schedule.</div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06]">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] gap-4 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              <span>Loop</span><span>Interval</span><span>Last Run</span><span>Runs</span><span>Actions</span>
            </div>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {loops.map(loop => (
              <div
                key={loop.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => loadRuns(loop)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${loop.enabled ? 'bg-[#1aff8c]' : 'bg-zinc-600'}`} />
                    <span className="text-sm font-medium text-zinc-200 truncate">{loop.name}</span>
                  </div>
                  <div className="ml-3.5 text-[11px] text-zinc-600 mt-0.5 truncate">{loop.agent} · {loop.goal?.slice(0, 50)}{loop.goal?.length > 50 ? '…' : ''}</div>
                </div>
                <div className="text-sm text-zinc-500 self-center">{intervalLabel(loop.interval_ms)}</div>
                <div className="text-xs text-zinc-500 self-center">{timeAgo(loop.last_run)}</div>
                <div className="text-xs text-zinc-500 self-center">{loop.run_count || 0} runs · {loop.fail_count || 0} fails</div>
                <div className="flex items-center gap-1.5 self-center" onClick={e => e.stopPropagation()}>
                  <button
                    disabled={busy[loop.id]}
                    onClick={() => toggleLoop(loop.id, !loop.enabled)}
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${loop.enabled ? 'border-amber-500/25 bg-amber-500/8 text-amber-400' : 'border-[#1aff8c]/25 bg-[#1aff8c]/8 text-[#1aff8c]'}`}
                    title={loop.enabled ? 'Pause' : 'Enable'}
                  >
                    {busy[loop.id] ? <Loader2 size={11} className="animate-spin" /> : loop.enabled ? <Pause size={11} /> : <Play size={11} />}
                  </button>
                  <button
                    disabled={busy[loop.id]}
                    onClick={() => deleteLoop(loop.id)}
                    className="w-7 h-7 rounded-lg border border-red-500/20 bg-red-500/5 flex items-center justify-center text-red-400 hover:bg-red-500/15 transition-all"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Run history */}
      {selectedLoop && (
        <Card>
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <div className="text-sm font-semibold text-white">{selectedLoop.name} — Run History</div>
          </div>
          {runsLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">
              <Loader2 size={14} className="animate-spin mr-2" /> Loading…
            </div>
          ) : runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-600">No runs yet.</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {runs.map(run => (
                <div key={run.id} className="flex items-start gap-3 px-5 py-3">
                  {run.status === 'success' || run.status === 'done'
                    ? <CheckCircle2 size={14} className="text-[#1aff8c] mt-0.5 flex-shrink-0" />
                    : run.status === 'failed'
                    ? <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    : <Loader2 size={14} className="text-amber-400 mt-0.5 flex-shrink-0 animate-spin" />
                  }
                  <div className="min-w-0 flex-1">
                    {run.error && <div className="text-xs text-red-400 mb-0.5">{run.error}</div>}
                    {run.output && <div className="text-xs text-zinc-400 truncate">{run.output?.slice(0, 100)}</div>}
                    <div className="text-[11px] text-zinc-600 mt-0.5">{timeAgo(run.started_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
