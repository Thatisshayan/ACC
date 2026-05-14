import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Route, ShieldCheck, History, Activity,
  Zap, Lock, Unlock, WifiOff, Loader2, RefreshCw, Send,
  CheckCircle2, XCircle, Clock, AlertCircle, ShieldAlert,
  Check, X, BookOpen, Layers, Download, AlertTriangle,
  Bot, Settings, ChevronRight, Bell, Terminal,
} from 'lucide-react';
import { useTaskBus }   from './hooks/useTaskBus';
import { useProviders } from './hooks/useProviders';
import { useSocket }    from './hooks/useSocket';
import { taskbusApi, serverApi } from './lib/api';
import { fmt, STATUS_COLORS }   from './lib/utils';

// ── Primitives ────────────────────────────────────────────────────────────────
function Card({ children, className='', glow }) {
  const g = { cyan:'border-cyan-400/25 shadow-[0_0_24px_rgba(0,242,255,0.06)]', amber:'border-amber-400/25 shadow-[0_0_20px_rgba(255,171,0,0.06)]', green:'border-green-400/25', red:'border-red-500/25' }[glow]||'border-white/10';
  return <div className={`bg-[#111118] border rounded-2xl p-5 ${g} ${className}`}>{children}</div>;
}
function SBadge({ status }) {
  const c = STATUS_COLORS[status]||'text-slate-400 bg-slate-400/10 border-slate-400/20';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider ${c}`}>{(status==='in_progress'||status==='running')&&<span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"/>}{String(status||'').replace(/_/g,' ')}</span>;
}
function Btn({ children, v='ghost', size='md', loading, disabled, onClick, className='' }) {
  const V={cyan:'bg-cyan-400/10 border-cyan-400/40 text-cyan-400 hover:bg-cyan-400/20',green:'bg-green-400/10 border-green-400/40 text-green-400 hover:bg-green-400/20',amber:'bg-amber-400/10 border-amber-400/40 text-amber-400 hover:bg-amber-400/20',red:'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20',ghost:'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'};
  const S={sm:'px-3 py-1.5 text-xs',md:'px-4 py-2 text-sm',lg:'px-6 py-2.5 text-sm font-semibold'};
  return <button onClick={onClick} disabled={disabled||loading} className={`inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-all ${V[v]||V.ghost} ${S[size]||S.md} ${(disabled||loading)?'opacity-40 cursor-not-allowed':''} ${className}`}>{loading&&<Loader2 size={12} className="animate-spin"/>}{children}</button>;
}
function Lbl({ children }) { return <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{children}</span>; }

// ── Provider Grid ─────────────────────────────────────────────────────────────
const PDOT = { 'api-ready':'bg-green-400 shadow-[0_0_6px_#00E676]', ready:'bg-green-400 shadow-[0_0_6px_#00E676]', key_set:'bg-amber-400', offline:'bg-slate-600', model_missing:'bg-amber-400', loading:'bg-cyan-400 animate-pulse', error:'bg-red-500' };
function ProviderGrid() {
  const { providers, updated, refetch } = useProviders();
  return (
    <div>
      <div className="flex items-center justify-between mb-3"><Lbl>Inference Providers</Lbl><button onClick={refetch} className="text-[10px] text-slate-600 hover:text-slate-400 flex items-center gap-1"><RefreshCw size={9}/> {updated?fmt.ago(updated):'…'}</button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {providers.map(p=>(
          <div key={p.name} className="bg-[#111118] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all">
            <div className="flex justify-between mb-1.5"><span className="text-sm font-semibold text-slate-200">{p.name}</span><span className={`w-2 h-2 rounded-full mt-1.5 ${PDOT[p.status]||'bg-slate-600'}`}/></div>
            <div className="text-[10px] text-slate-500 font-mono mb-2">{String(p.status||'').replace(/_/g,' ')}</div>
            <div className="flex gap-1 flex-wrap">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${p.cost_tier==='local_free'||p.cost_tier==='zero_cost'?'bg-green-400/10 text-green-400':p.cost_tier==='low_cost'?'bg-cyan-400/10 text-cyan-400':'bg-amber-400/10 text-amber-400'}`}>{(p.cost_tier||'').replace(/_/g,' ')}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.is_real_ai?'bg-green-400/10 text-green-400':'bg-purple-300/10 text-purple-300'}`}>{p.is_real_ai?'real ai':'stub'}</span>
            </div>
            {p.install_cmd&&<div className="mt-2 text-[9px] text-amber-400/60 font-mono break-all">{p.install_cmd}</div>}
            {p.note&&!p.install_cmd&&<div className="mt-1 text-[9px] text-slate-600 leading-tight">{p.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Command Composer ──────────────────────────────────────────────────────────
const AGENTS = ['claude','chatgpt','gemini','notebooklm','clickup'];
const MODES  = [['manual','Manual'],['sandbox','Sandbox'],['semi_auto','Semi-Auto'],['full_auto','Full-Auto (Internal)']];
function CommandComposer({ onCreate }) {
  const [instr, setInstr] = useState('');
  const [agent, setAgent] = useState('claude');
  const [mode,  setMode]  = useState('semi_auto');
  const [risk,  setRisk]  = useState(2);
  const [busy,  setBusy]  = useState(false);
  const [sent,  setSent]  = useState(false);
  const [preview, setPreview] = useState(null);

  function generate() {
    if (!instr.trim()) return;
    setPreview({ schema:'ACC-v2', target_agent:agent, assigned_agent:agent, automation_mode:mode, risk_level:risk, title:instr.slice(0,80), instruction:instr, required_output:'Analysis and recommendation', created_by:'dashboard', timestamp:new Date().toISOString() });
  }
  async function execute() {
    if (!preview) return;
    setBusy(true);
    try {
      await taskbusApi.createTask(preview);
      setSent(true); setInstr(''); setPreview(null);
      setTimeout(()=>setSent(false), 3000);
      if (onCreate) onCreate();
    } catch(e) { alert('Error: '+e.message); }
    finally { setBusy(false); }
  }
  return (
    <Card glow="cyan">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-cyan-400"><Terminal size={16}/><span className="text-sm font-semibold">Command Composer</span></div>
        <div className="flex gap-2">
          <select value={agent} onChange={e=>setAgent(e.target.value)} className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs text-slate-300 outline-none">{AGENTS.map(a=><option key={a} value={a}>{a}</option>)}</select>
          <select value={mode}  onChange={e=>setMode(e.target.value)}  className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs text-slate-300 outline-none">{MODES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <textarea value={instr} onChange={e=>setInstr(e.target.value)} placeholder="Enter mission objective for Features 1-50…" className="w-full h-24 bg-black/30 border border-white/10 rounded-lg p-3 text-sm outline-none resize-none text-slate-200 placeholder:text-slate-600 font-mono focus:border-cyan-400/50 transition-colors"/>
      <div className="flex items-center gap-2 mt-3">
        <Lbl>Risk</Lbl>
        {[1,2,3,4,5].map(l=><button key={l} onClick={()=>setRisk(l)} className={`w-7 h-7 rounded text-[10px] font-bold border transition-all ${risk===l?l>=4?'bg-red-500/30 border-red-500 text-red-400':l===3?'bg-amber-400/30 border-amber-400 text-amber-400':'bg-green-400/30 border-green-400 text-green-400':'bg-white/5 border-white/10 text-slate-600'}`}>{l}</button>)}
        {risk>=4&&<span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={9}/>High-risk locked to sandbox</span>}
      </div>
      <div className="flex gap-2 mt-4">
        <Btn v="ghost" onClick={generate} disabled={!instr.trim()} className="flex-1">Generate Packet</Btn>
        <Btn v="cyan"  onClick={execute}  loading={busy} disabled={!preview} className="flex-1"><Send size={13}/>{sent?'Sent!':'Execute'}</Btn>
      </div>
      {preview&&<div className="mt-4 bg-black/40 border border-white/5 rounded-xl overflow-hidden"><div className="px-3 py-2 bg-white/5 text-[10px] text-slate-500 font-mono uppercase">Packet Preview</div><pre className="p-3 text-[10px] font-mono text-cyan-400/70 overflow-x-auto max-h-40 scrollbar-hide">{JSON.stringify(preview,null,2)}</pre></div>}
    </Card>
  );
}

// ── Task Feed ─────────────────────────────────────────────────────────────────
function TaskFeed({ tasks, loading }) {
  if (loading) return <div className="py-10 text-center text-slate-600 text-sm">Loading…</div>;
  if (!tasks.length) return <div className="border border-dashed border-white/10 rounded-xl p-8 text-center text-slate-600 text-sm">No tasks yet. Use the Command Composer to dispatch the first one.</div>;
  return (
    <div className="space-y-3">
      <Lbl>Task Feed & Result Inbox</Lbl>
      <div className="space-y-2 mt-2">
        {tasks.slice(0,20).map(t=>(
          <div key={t.id} className="bg-[#111118] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all fade-in">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{t.title}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <SBadge status={t.status}/>
                  <span className="text-[10px] bg-cyan-400/10 text-cyan-400 px-2 py-0.5 rounded font-mono uppercase">{t.assigned_agent}</span>
                  <span className="text-[10px] bg-white/5 text-slate-500 px-2 py-0.5 rounded uppercase">{t.automation_mode}</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-600 shrink-0">{fmt.ago(t.updated_at||t.created_at)}</span>
            </div>
            {(t.result||t.summary)&&<div className="mt-3 p-3 bg-black/40 rounded-lg border-l-2 border-cyan-400/50 text-xs text-slate-300 leading-relaxed">{String(t.result||t.summary).slice(0,250)}{(t.result||t.summary).length>250?'…':''}</div>}
            {t.provider_used&&<div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
              <Zap size={9} className={t.is_real_ai_result?'text-green-400':'text-purple-300'}/>
              <span className="text-[10px] text-slate-500">{t.provider_used}</span>
              {t.cost_tier&&<span className="text-[9px] bg-white/5 text-slate-600 px-1.5 rounded">{t.cost_tier}</span>}
              <span className={`ml-auto text-[9px] font-mono ${t.is_real_ai_result?'text-green-400':'text-purple-300'}`}>{t.is_real_ai_result?'VERIFIED AI':'STUB'}</span>
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Approval Gate ─────────────────────────────────────────────────────────────
function ApprovalGate({ pending, approveTask, rejectTask }) {
  const [busy, setBusy] = useState({});
  async function handle(id, action) {
    setBusy(p=>({...p,[id]:action}));
    try { action==='approve' ? await approveTask(id) : await rejectTask(id); }
    catch(e) { alert('Error: '+e.message); }
    finally { setBusy(p=>({...p,[id]:null})); }
  }
  return (
    <Card glow="amber" className="bg-amber-400/5">
      <div className="flex items-center gap-2 mb-4 text-amber-400">
        <ShieldAlert size={16}/><span className="text-sm font-bold uppercase tracking-widest">Approval Gate</span>
        {pending.length>0&&<span className="ml-auto text-[10px] bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full font-mono">{pending.length}</span>}
      </div>
      {!pending.length
        ? <div className="py-5 text-center text-slate-600 text-xs italic">No pending approvals — system clear.</div>
        : pending.map(t=>(
            <div key={t.id} className="bg-black/40 border border-amber-400/30 rounded-lg p-4 mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-bold text-slate-200">{(t.title||'').slice(0,50)}</span>
                <span className="text-[10px] border border-amber-400/30 text-amber-400 px-1.5 py-0.5 rounded font-mono">Risk {t.risk_level||'?'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">Agent <span className="text-cyan-400">{t.assigned_agent}</span> — <span className="italic">{(t.instruction||'').slice(0,70)}</span></p>
              <div className="flex gap-2">
                <Btn v="green" size="sm" loading={busy[t.id]==='approve'} onClick={()=>handle(t.id,'approve')} className="flex-1"><Check size={12}/>Approve</Btn>
                <Btn v="red"   size="sm" loading={busy[t.id]==='reject'}  onClick={()=>handle(t.id,'reject')}  className="flex-1"><X size={12}/>Reject</Btn>
              </div>
            </div>
          ))
      }
    </Card>
  );
}

// ── Side panels ───────────────────────────────────────────────────────────────
function NotebookPanel({ completed }) {
  const [busy, setBusy] = useState(false);
  async function exportMd() {
    setBusy(true);
    const md = completed.map(t=>`# ${t.title}\n\n**Status:** ${t.status}\n**Provider:** ${t.provider_used||'—'}\n**Time:** ${t.created_at}\n\n${t.result||t.instruction||'—'}\n\n---\n`).join('\n');
    const url = URL.createObjectURL(new Blob([md],{type:'text/markdown'}));
    const a = Object.assign(document.createElement('a'),{href:url,download:`ACC-Packets-${new Date().toISOString().slice(0,10)}.md`});
    a.click(); URL.revokeObjectURL(url); setBusy(false);
  }
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4 text-purple-300"><BookOpen size={15}/><span className="text-sm font-bold uppercase tracking-widest">NotebookLM</span></div>
      <div className="text-[11px] bg-black/30 border border-white/5 rounded p-2 mb-3 flex justify-between"><span className="text-slate-500">Truth packets ready:</span><span className="text-purple-300 font-mono">{completed.length}</span></div>
      <Btn v="ghost" onClick={exportMd} loading={busy} disabled={!completed.length} className="w-full border-purple-300/30 text-purple-300 hover:bg-purple-300/10"><Download size={12}/>Export Markdown</Btn>
      <p className="text-[9px] text-slate-600 text-center mt-2 italic">For manual NotebookLM source ingestion.</p>
    </Card>
  );
}

function ClickUpPanel() {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2 text-slate-400"><Layers size={15}/><span className="text-sm font-bold uppercase tracking-widest">ClickUp</span></div><SBadge status="pending"/></div>
      <div className="flex items-start gap-2 p-3 bg-amber-400/10 border border-amber-400/20 rounded-lg text-[10px] text-amber-400/80 mb-3"><AlertCircle size={11} className="shrink-0 mt-0.5"/>CLICKUP_API_KEY missing. Tasks queued locally.</div>
      <button disabled className="w-full py-2 bg-white/5 border border-white/10 text-slate-600 rounded-lg text-xs cursor-not-allowed">Push to ClickUp</button>
    </Card>
  );
}

function StatsRow({ stats }) {
  const items = [
    { label:'Total Tasks',  val: stats.total_tasks||0,       color:'text-cyan-400'  },
    { label:'Completed',    val: stats.by_status?.done||0,   color:'text-green-400' },
    { label:'In Progress',  val: stats.by_status?.in_progress||0, color:'text-amber-400' },
    { label:'Approvals',    val: stats.pending_approvals||0, color: (stats.pending_approvals||0)>0?'text-red-400':'text-slate-400' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(i=>(
        <Card key={i.label} className="text-center py-4">
          <div className={`text-3xl font-bold font-mono ${i.color}`}>{i.val}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">{i.label}</div>
        </Card>
      ))}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
const NAV = [
  { id:'router',    icon:<Route size={18}/>,      label:'Task Router' },
  { id:'dashboard', icon:<LayoutGrid size={18}/>, label:'Dashboard'   },
  { id:'vault',     icon:<ShieldCheck size={18}/>,label:'Vault'       },
  { id:'history',   icon:<History size={18}/>,    label:'History'     },
];

function Sidebar({ page, set }) {
  return (
    <aside className="w-[72px] lg:w-56 bg-[#0A0A0F] border-r border-white/10 flex flex-col shrink-0">
      <div className="p-4 lg:p-5 flex items-center gap-3 border-b border-white/10">
        <div className="h-8 w-8 bg-cyan-400 rounded-lg flex items-center justify-center text-black font-black text-[11px] italic shrink-0">ACC</div>
        <span className="hidden lg:block text-sm font-bold text-slate-200 tracking-tight">Command Center</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 mt-1">
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>set(n.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${page===n.id?'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20':'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
            {n.icon}<span className="hidden lg:block text-sm font-medium">{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-2 border-t border-white/10">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-600 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all">
          <Settings size={18}/><span className="hidden lg:block text-sm">Admin</span>
        </button>
      </div>
    </aside>
  );
}

function TopBar({ live, ws }) {
  return (
    <header className="h-14 border-b border-white/10 bg-[#0A0A0F]/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-50 shrink-0">
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5"><Activity size={12} className={live?'text-green-400':'text-red-400'}/><span className="font-mono text-slate-500">{live?'localhost:4000':'OFFLINE'}</span></div>
        <div className="h-3 w-px bg-white/10"/>
        {!ws&&<div className="flex items-center gap-1.5 text-amber-400"><WifiOff size={11}/>WS polling</div>}
        <Unlock size={11} className="text-amber-400 animate-pulse"/><span className="text-amber-400 font-mono">VAULT_UNENCRYPTED</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-cyan-400/10 border border-cyan-400/30 px-3 py-1 rounded-full text-[10px] text-cyan-400 font-bold uppercase"><Zap size={9}/>DeepSeek Active</div>
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[10px] text-slate-300"><div className="w-1.5 h-1.5 rounded-full bg-green-400"/>Shayan</div>
      </div>
    </header>
  );
}

// ── Pages ─────────────────────────────────────────────────────────────────────
function RouterPage({ tb }) {
  return (
    <div className="space-y-5">
      <ProviderGrid/>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          <CommandComposer onCreate={tb.refetch}/>
          <TaskFeed tasks={tb.tasks} loading={tb.loading}/>
        </div>
        <div className="lg:col-span-4 space-y-5">
          <ApprovalGate pending={tb.pending} approveTask={tb.approveTask} rejectTask={tb.rejectTask}/>
          <NotebookPanel completed={tb.completed}/>
          <ClickUpPanel/>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({ tb }) {
  return (
    <div className="space-y-5">
      <StatsRow stats={tb.stats}/>
      <ProviderGrid/>
      <TaskFeed tasks={tb.tasks} loading={tb.loading}/>
    </div>
  );
}

function VaultPage() {
  const keys = [
    { name:'ACC_VAULT_MASTER_KEY',     status:'missing', note:'Add to .env for AES-256-GCM encryption' },
    { name:'ACC_APPROVAL_HMAC_SECRET', status:'missing', note:'Add to .env for tamper-evident approvals' },
    { name:'TELEGRAM_BOT_TOKEN',       status:'set',     note:'Loaded from .env — rotate via @BotFather before production' },
    { name:'DEEPSEEK_API_KEY',         status:'set',     note:'Primary AI provider — active' },
    { name:'CLAUDE_API_KEY',           status:'set',     note:'Premium fallback — balance depleted' },
    { name:'OPENAI_API_KEY',           status:'set',     note:'Voice (Whisper) + Vision (GPT-4o)' },
    { name:'NOTION_API_KEY',           status:'set',     note:'Memory backup — active' },
    { name:'GOOGLE_CLIENT_ID',         status:'missing', note:'Required for Gmail OAuth / email monitoring' },
    { name:'CLICKUP_API_KEY',          status:'missing', note:'Required for ClickUp task sync' },
  ];
  return (
    <Card glow="amber" className="max-w-2xl bg-amber-400/5">
      <div className="flex items-center gap-3 mb-5 text-amber-400"><ShieldCheck size={18}/><span className="font-bold uppercase tracking-widest">Vault & Key Status</span></div>
      <div className="space-y-2">
        {keys.map(k=>(
          <div key={k.name} className="flex items-start justify-between gap-3 p-3 bg-black/30 border border-white/5 rounded-lg">
            <div>
              <div className="text-xs font-mono text-slate-300">{k.name}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{k.note}</div>
            </div>
            <SBadge status={k.status==='set'?'done':'failed'}/>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HistoryPage({ tb }) {
  const sorted = [...tb.tasks].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return (
    <Card>
      <Lbl>All Commands — {sorted.length} total</Lbl>
      <div className="mt-4 space-y-0.5">
        {sorted.map(t=>(
          <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all">
            {t.status==='done'||t.status==='completed'?<CheckCircle2 size={12} className="text-green-400 shrink-0"/>:t.status==='failed'?<XCircle size={12} className="text-red-400 shrink-0"/>:t.status==='in_progress'?<Clock size={12} className="text-amber-400 animate-pulse shrink-0"/>:<AlertCircle size={12} className="text-slate-600 shrink-0"/>}
            <span className="text-xs text-slate-300 flex-1 truncate">{t.title}</span>
            <span className="text-[10px] bg-cyan-400/10 text-cyan-400 px-1.5 rounded font-mono shrink-0">{t.assigned_agent}</span>
            <span className="text-[10px] text-slate-600 shrink-0">{fmt.ago(t.created_at)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]     = useState('router');
  const [live, setLive]     = useState(false);
  const { connected: ws }   = useSocket();
  const tb                  = useTaskBus();

  useEffect(() => {
    const check = async () => { try { await serverApi.health(); setLive(true); } catch { setLive(false); } };
    check();
    const iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex h-screen bg-[#0A0A0F] text-slate-200 overflow-hidden">
      <Sidebar page={page} set={setPage}/>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar live={live} ws={ws}/>
        <main className="flex-1 overflow-y-auto p-5 space-y-4">
          {tb.error && (
            <div className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-400 font-mono">
              {tb.error} — Run: <code>node scripts/start.js</code>
            </div>
          )}
          {page === 'router'    && <RouterPage    tb={tb}/>}
          {page === 'dashboard' && <DashboardPage tb={tb}/>}
          {page === 'vault'     && <VaultPage/>}
          {page === 'history'   && <HistoryPage   tb={tb}/>}
        </main>
      </div>
    </div>
  );
}
