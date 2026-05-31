import React, { useState, useEffect } from 'react';
import { Play, CheckCircle2, XCircle, Loader2, ArrowRight, GitBranch, Mail, Search, Share2, Zap } from 'lucide-react';
import { getRuntimeApiBaseUrl } from '../lib/api.js';

const API = getRuntimeApiBaseUrl();

const WORKFLOWS = [
  {
    id: 'outreach',
    name: 'Cold Outreach Pipeline',
    description: 'CSV leads → email find → AI draft → Telegram approve → send → track',
    icon: Mail,
    color: '#00d4ff',
    steps: ['Load leads', 'Find emails (Hunter)', 'Draft message (AI)', 'Telegram approval', 'Send via Resend', 'Log results'],
    statusEndpoint: '/api/outreach/status',
    triggerEndpoint: '/api/outreach/run',
    triggerBody: { leads: [{ name: 'Demo Lead', company: 'Acme Corp', domain: 'acmecorp.com', role: 'CEO' }] },
    requiresInput: true,
    inputLabel: 'Paste leads JSON',
    inputPlaceholder: '[{"name":"Jane Doe","company":"Acme","domain":"acme.com","role":"CEO"}]',
  },
  {
    id: 'fsc',
    name: 'Social Content Pipeline',
    description: 'Idea → AI copy → image → video → Telegram approve → publish',
    icon: Share2,
    color: '#a78bfa',
    steps: ['Content idea', 'AI copy generation (FSC)', 'Image generation (DALL-E)', 'Video animation (Runway)', 'Telegram approval', 'Publish to Instagram/LinkedIn'],
    statusEndpoint: '/api/fsc/status',
    triggerEndpoint: '/api/fsc/generate',
    triggerBody: { idea: 'Test post about AI agents', platform: 'instagram', format: 'post', tone: 'professional' },
    requiresInput: false,
  },
  {
    id: 'synapse',
    name: 'Multi-Agent Debate',
    description: 'Broadcast question → agents debate → synthesis → export',
    icon: Zap,
    color: '#1aff8c',
    steps: ['Receive question', 'Broadcast to Claude + GPT-4 + Gemini + DeepSeek', 'Collect responses', 'Synthesize answer', 'Return to user'],
    statusEndpoint: '/api/synapse/status',
    triggerEndpoint: '/api/synapse/quick',
    triggerBody: { message: 'What is the best tech stack for a startup in 2025?', preset: 'brainstorm' },
    requiresInput: false,
  },
  {
    id: 'jobs',
    name: 'Job Application Flow',
    description: 'Search → filter → cover letter → Telegram approve → apply',
    icon: Search,
    color: '#f59e0b',
    steps: ['Job search (Indeed/LinkedIn)', 'Filter by criteria', 'Generate cover letter', 'Telegram approval', 'Form fill + submit', 'Log application'],
    statusEndpoint: null,
    triggerEndpoint: '/api/taskbus/tasks',
    triggerBody: {
      title: 'Apply for PM roles in Toronto',
      instruction: 'Search for Product Manager roles in Toronto, filter for senior-level, draft cover letter, await approval before applying.',
      assigned_agent: 'alphonso',
      approval_required: true,
      automation_mode: 'semi_auto',
      created_by: 'ui:workflows',
    },
    requiresInput: false,
  },
];

function Card({ className = '', children }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-[#0c0c18] ${className}`}>
      {children}
    </div>
  );
}

function WorkflowCard({ wf }) {
  const [status, setStatus]   = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');
  const [input, setInput]     = useState('');
  const Icon = wf.icon;

  useEffect(() => {
    if (!wf.statusEndpoint) return;
    fetch(API + wf.statusEndpoint)
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {});
  }, [wf.statusEndpoint]);

  async function trigger() {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      let body = wf.triggerBody;
      if (wf.requiresInput && input.trim()) {
        try { body = { leads: JSON.parse(input.trim()) }; }
        catch { throw new Error('Invalid JSON — check leads format'); }
      }
      const res = await fetch(API + wf.triggerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success && !data.ok && res.status >= 400) throw new Error(data.error || 'Trigger failed');
      setResult(data);
    } catch(e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const ready = status?.ready || status?.enabled || status?.available_agents;

  return (
    <Card className="p-5 hover:border-white/[0.12] transition-colors">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: wf.color + '15', border: `1px solid ${wf.color}25` }}>
          <Icon size={18} style={{ color: wf.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{wf.name}</h3>
            {status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ready ? 'border-[#1aff8c]/20 text-[#1aff8c]/70' : 'border-zinc-700 text-zinc-600'}`}>
                {ready ? 'ready' : 'needs config'}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{wf.description}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {wf.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-500">{step}</span>
            {i < wf.steps.length - 1 && <ArrowRight size={9} className="text-zinc-700" />}
          </div>
        ))}
      </div>

      {wf.requiresInput && (
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={wf.inputPlaceholder}
          rows={2}
          className="w-full mb-3 rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 outline-none resize-none font-mono"
        />
      )}

      <button
        onClick={trigger}
        disabled={running}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40"
        style={{ borderColor: wf.color + '30', background: wf.color + '10', color: wf.color }}
      >
        {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? 'Running…' : 'Trigger'}
      </button>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">{error}</div>
      )}
      {result && (
        <div className="mt-3 rounded-xl border border-[#1aff8c]/15 bg-[#1aff8c]/5 px-3 py-2 text-xs text-[#1aff8c]">
          {result.message || result.synthesis || (result.success ? 'Triggered successfully' : JSON.stringify(result).slice(0, 120))}
        </div>
      )}
    </Card>
  );
}

export default function WorkflowsPage() {
  return (
    <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Automation</div>
        <h2 className="text-xl font-bold text-white">Workflows</h2>
        <p className="text-xs text-zinc-600 mt-1">End-to-end automated pipelines. Each requires Telegram approval before taking external action.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {WORKFLOWS.map(wf => <WorkflowCard key={wf.id} wf={wf} />)}
      </div>
    </div>
  );
}
