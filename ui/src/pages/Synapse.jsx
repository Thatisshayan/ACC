import React, { useState, useEffect, useRef } from 'react';
import { Bot, Zap, Send, ChevronDown, CheckCircle2, XCircle, Loader2, Layers } from 'lucide-react';
import { getRuntimeApiBaseUrl } from '../lib/api.js';

const API = getRuntimeApiBaseUrl();

const PRESET_LABELS = {
  brainstorm:    'Brainstorm',
  'code-review': 'Code Review',
  research:      'Research',
  creative:      'Creative',
  quick:         'Quick',
};

const MODE_LABELS = {
  default:     'Default',
  compare:     'Compare',
  debate:      'Debate',
  synthesis:   'Synthesis',
  'red-team':  'Red Team',
  'code-review': 'Code Review',
};

function Card({ className = '', children }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-[#0c0c18] ${className}`}>
      {children}
    </div>
  );
}

function AgentBubble({ name, response, error, pending }) {
  const color = error ? '#f87171' : '#1aff8c';
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: color + '15', border: `1px solid ${color}25` }}>
          <Bot size={13} style={{ color }} />
        </div>
        <span className="text-sm font-semibold text-white">{name}</span>
        {pending && <Loader2 size={12} className="text-zinc-500 animate-spin ml-auto" />}
        {error && <XCircle size={12} className="text-red-400 ml-auto" />}
        {!pending && !error && response && <CheckCircle2 size={12} className="text-[#1aff8c] ml-auto" />}
      </div>
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : response ? (
        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{response}</p>
      ) : pending ? (
        <p className="text-xs text-zinc-600">Thinking…</p>
      ) : null}
    </div>
  );
}

export default function SynapsePage() {
  const [status, setStatus]       = useState(null);
  const [message, setMessage]     = useState('');
  const [preset, setPreset]       = useState('brainstorm');
  const [mode, setMode]           = useState('default');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');
  const [history, setHistory]     = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch(API + '/api/synapse/status')
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [result]);

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim() || loading) return;
    const msg = message.trim();
    setMessage('');
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(API + '/api/synapse/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, preset, mode, synthesize: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Broadcast failed');
      setResult(data);
      setHistory(h => [{ msg, preset, mode, result: data, at: new Date().toLocaleTimeString() }, ...h].slice(0, 10));
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const keyStatus = status?.keys || {};

  return (
    <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Multi-Agent</div>
          <h2 className="text-xl font-bold text-white">Synapse</h2>
          <p className="text-xs text-zinc-600 mt-1">Broadcast to multiple AI agents simultaneously. Get individual responses + synthesized answer.</p>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(keyStatus).map(([k, v]) => (
            <span key={k} className={`text-[10px] px-2 py-1 rounded-lg border font-mono ${v ? 'border-[#1aff8c]/20 bg-[#1aff8c]/5 text-[#1aff8c]/70' : 'border-zinc-700 text-zinc-600'}`}>
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* Input */}
      <Card className="p-4">
        <form onSubmit={handleSend} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                placeholder="Ask all agents… e.g. 'Review this architecture decision' or 'Debate: monolith vs microservices'"
                rows={3}
                className="w-full rounded-xl border border-white/[0.10] bg-black/40 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none focus:border-[#1aff8c]/40 focus:shadow-[0_0_0_1px_rgba(26,255,140,0.12)] transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={preset}
              onChange={e => setPreset(e.target.value)}
              className="rounded-lg border border-white/[0.10] bg-black/40 px-3 py-1.5 text-xs text-zinc-300 outline-none"
            >
              {Object.entries(PRESET_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              className="rounded-lg border border-white/[0.10] bg-black/40 px-3 py-1.5 text-xs text-zinc-300 outline-none"
            >
              {Object.entries(MODE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!message.trim() || loading}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-xl border border-[#1aff8c]/25 bg-[#1aff8c]/8 text-xs font-semibold text-[#1aff8c] disabled:opacity-40 transition-all hover:bg-[#1aff8c]/15"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {loading ? 'Thinking…' : 'Broadcast'}
            </button>
          </div>
        </form>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">{error}</div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Synthesis */}
          {result.synthesis && (
            <Card className="p-4 border-[#1aff8c]/15">
              <div className="flex items-center gap-2 mb-3">
                <Layers size={14} className="text-[#1aff8c]" />
                <span className="text-sm font-semibold text-white">Synthesis</span>
                <span className="ml-auto text-[11px] text-zinc-600">{result.successful} agents · {result.failed} failed</span>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{result.synthesis}</p>
            </Card>
          )}

          {/* Individual responses */}
          {result.responses && result.responses.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-3">Individual Responses</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {result.responses.map((r, i) => (
                  <AgentBubble
                    key={i}
                    name={r.agent || r.model || 'Agent'}
                    response={r.response || r.content}
                    error={r.error}
                    pending={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick presets */}
      {!result && !loading && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-3">Quick Presets</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: 'Debate: Build vs Buy',   msg: 'Should a startup build its own auth system or use a third-party service? Debate.', preset: 'brainstorm', mode: 'debate' },
              { label: 'Code Review',             msg: 'What are the best practices for error handling in async Node.js APIs?', preset: 'code-review', mode: 'code-review' },
              { label: 'Research: AI Agents',     msg: 'What are the most effective patterns for building autonomous AI agents in 2025?', preset: 'research', mode: 'default' },
              { label: 'Pro/Con: Microservices',  msg: 'Analyze the pros and cons of microservices vs monolith for a 5-person startup.', preset: 'brainstorm', mode: 'compare' },
              { label: 'Red Team this idea',      msg: 'Red team this SaaS idea: an AI that monitors your email and automates replies.', preset: 'brainstorm', mode: 'red-team' },
              { label: 'Synthesize: GTM strategy', msg: 'What are the most effective go-to-market strategies for a B2B AI tool in 2025?', preset: 'research', mode: 'synthesis' },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => { setMessage(p.msg); setPreset(p.preset); setMode(p.mode); }}
                className="text-left p-3 rounded-xl border border-white/[0.07] bg-black/20 hover:border-white/[0.14] hover:bg-white/[0.04] transition-all"
              >
                <div className="text-xs font-medium text-zinc-300">{p.label}</div>
                <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{p.preset} · {p.mode}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
