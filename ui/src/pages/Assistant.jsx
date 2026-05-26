import React, { useEffect, useMemo, useState } from 'react';
import VoiceInput from '../VoiceInput.jsx';
import {
  executeAssistantPrompt,
  getAssistantStatus,
  listMessengerUsers,
  parseAssistantPrompt,
} from '../api.js';

const shell = 'rounded-[28px] border border-white/[0.07] bg-white/[0.04] backdrop-blur-xl';

function chipClass(active) {
  return active
    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
    : 'border-white/[0.08] bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]';
}

function StatusCard({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
      {detail && <div className="mt-1 text-xs text-zinc-500">{detail}</div>}
    </div>
  );
}

function ActionChip({ children, onClick, active = false }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs transition-colors ${chipClass(active)}`}
    >
      {children}
    </button>
  );
}

export default function Assistant() {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [prompt, setPrompt] = useState('Send a private message to user X: I have the latest draft ready for review.');
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState(null);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastVoice, setLastVoice] = useState('');

  const currentUser = useMemo(
    () => users.find((user) => String(user.id) === String(currentUserId)),
    [users, currentUserId],
  );

  const quickActions = useMemo(() => [
    'Show my inbox',
    'Show system status',
    'Send a private message to user X: Ready for approval.',
    'Apply for jobs for me: product manager remote',
    'Publish social content through alphonso and socialclaw',
    'Show pending approvals',
    'Show bridge packets',
    'Show recent results',
    'What is the health of the messenger?',
    'Who is online right now?',
  ], []);

  const workflowHints = [
    { title: 'Inbox first', desc: 'Open the private messenger and check what needs attention.', text: 'Show my inbox' },
    { title: 'Status sweep', desc: 'See the assistant, bot, bridge, and messenger truth together.', text: 'Show system status' },
    { title: 'Send a note', desc: 'Route a private message to another ACC user.', text: 'Send a private message to user X: Ready for approval.' },
    { title: 'Apply for roles', desc: 'Launch the job-apply workflow with a role and location.', text: 'Apply for jobs for me: product manager remote' },
    { title: 'Publish lane', desc: 'Generate a social draft and hand it to SocialClaw.', text: 'Publish social content through alphonso and socialclaw' },
    { title: 'Approvals', desc: 'Open the queue of waiting review actions.', text: 'Show pending approvals' },
    { title: 'Recent results', desc: 'Inspect fresh workflow outputs and task outcomes.', text: 'Show recent results' },
    { title: 'Bridge history', desc: 'Review the latest Alphonso packets and content sync activity.', text: 'Show bridge packets' },
  ];

  async function refreshMeta() {
    const [usersPayload, statusPayload] = await Promise.all([
      listMessengerUsers().catch(() => ({ users: [] })),
      getAssistantStatus().catch(() => ({ success: false })),
    ]);
    const nextUsers = Array.isArray(usersPayload.users) ? usersPayload.users : [];
    setUsers(nextUsers);
    if (!currentUserId && nextUsers.length) {
      const preferred = nextUsers.find((user) => user.role === 'human') || nextUsers[0];
      if (preferred) setCurrentUserId(String(preferred.id));
    }
    setAssistantStatus(statusPayload || null);
  }

  useEffect(() => {
    refreshMeta().catch((e) => setError(e.message || 'Assistant failed to load'));
  }, []);

  async function handleParse(nextText = prompt) {
    if (!nextText.trim()) return;
    setBusy(true);
    setError('');
    try {
      const payload = await parseAssistantPrompt({ text: nextText, userId: currentUserId });
      setParsed(payload.parsed || null);
      setResult(null);
    } catch (e) {
      setError(e.message || 'Could not parse prompt');
    } finally {
      setBusy(false);
    }
  }

  async function handleExecute(nextText = prompt) {
    if (!nextText.trim()) return;
    setBusy(true);
    setError('');
    try {
      const payload = await executeAssistantPrompt({
        text: nextText,
        userId: currentUserId,
      });
      setResult(payload);
      setParsed(payload.parsed || parsed);
    } catch (e) {
      setError(e.message || 'Assistant execution failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleVoiceResult(data) {
    const next = data?.command || data?.transcript || '';
    if (!next) return;
    setPrompt(next);
    setLastVoice(next);
    try {
      const parsedPayload = await parseAssistantPrompt({ text: next, userId: currentUserId });
      setParsed(parsedPayload.parsed || null);
      setResult(null);
    } catch (_) {
      // keep silent; voice input already surfaced the transcript
    }
  }

  const status = assistantStatus || {};

  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <div className={`${shell} overflow-hidden`}>
          <div className="relative p-5 md:p-7">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.10),transparent_28%)]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                  Voice-first assistant
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Talk to ACC like a chief operator.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
                  This is the mobile-first command surface for ACC. Speak a request, parse the intent, and let the brain route the task through messenger, workflows, approvals, and bridge truth without Telegram being the primary UX.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {quickActions.map((action) => (
                    <ActionChip key={action} onClick={() => { setPrompt(action); setLastVoice(''); }}>
                      {action}
                    </ActionChip>
                  ))}
                </div>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1">
                <StatusCard
                  label="Mode"
                  value="Push-to-talk + text"
                  detail="Mobile assistant surface"
                />
                <StatusCard
                  label="Assistant"
                  value={status.overall || 'ready'}
                  detail={`Messenger ${status?.messenger?.status || 'unknown'} - Bot ${status?.bot?.status || 'unknown'}`}
                />
                <StatusCard
                  label="User"
                  value={currentUser?.name || currentUserId || 'not selected'}
                  detail={users.length ? `${users.length} messenger users loaded` : 'No messenger users loaded'}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <div className={`${shell} p-4 md:p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Live voice</div>
                  <div className="mt-2 text-lg font-medium text-white">Press, speak, and let ACC do the routing.</div>
                  <div className="mt-1 text-sm text-zinc-500">Voice input is the primary mobile gesture. Text stays available as fallback.</div>
                </div>
                <button
                  onClick={() => refreshMeta()}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-zinc-100 hover:bg-white/[0.08]"
                >
                  Refresh truth
                </button>
              </div>

              <div className="mt-5 rounded-[26px] border border-white/[0.06] bg-black/20 p-3 md:p-4">
                <VoiceInput onResult={handleVoiceResult} />
              </div>

              {lastVoice && (
                <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Last voice command: {lastVoice}
                </div>
              )}
            </div>

            <div className={`${shell} p-4 md:p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Command composer</div>
                  <div className="mt-1 text-lg font-medium text-white">Type a request or tap a suggestion.</div>
                </div>
                <div className="text-xs text-zinc-500">User: {currentUser?.name || currentUserId || 'not selected'}</div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-xs text-zinc-500">
                  Tell ACC something
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-[22px] border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-white outline-none resize-none focus:border-emerald-500/40"
                    placeholder="Send a private message to user X: ..."
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleParse(prompt)}
                    disabled={busy}
                    className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/15 disabled:opacity-50"
                  >
                    Parse intent
                  </button>
                  <button
                    onClick={() => handleExecute(prompt)}
                    disabled={busy || !prompt.trim()}
                    className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
                  >
                    Execute
                  </button>
                </div>
              </div>
            </div>

            <div className={`${shell} p-4 md:p-5`}>
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Suggested flows</div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {workflowHints.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => setPrompt(item.text)}
                    className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <div className="text-sm font-medium text-white">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`${shell} p-4 md:p-5`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Parsed intent</div>
                  <div className="mt-1 text-lg font-medium text-white">What ACC heard</div>
                </div>
                <button
                  onClick={() => setParsed(null)}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.08]"
                >
                  Clear
                </button>
              </div>
              <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm text-zinc-300 min-h-[160px]">
                {parsed ? (
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(parsed, null, 2)}</pre>
                ) : (
                  <div className="text-zinc-500">No parsed intent yet. Speak or type a request.</div>
                )}
              </div>
            </div>

            <div className={`${shell} p-4 md:p-5`}>
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Execution result</div>
              <div className="mt-1 text-lg font-medium text-white">What ACC did</div>
              <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm text-zinc-300 min-h-[180px]">
                {result ? (
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(result, null, 2)}</pre>
                ) : (
                  <div className="text-zinc-500">Execution results appear here after you tap Execute.</div>
                )}
              </div>
            </div>

            <div className={`${shell} p-4 md:p-5`}>
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Runtime truth</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <StatusCard
                  label="Messenger"
                  value={status?.messenger?.status || 'ready'}
                  detail={`Threads: ${status?.messenger?.threads ?? 'n/a'} - Messages: ${status?.messenger?.messages ?? 'n/a'}`}
                />
                <StatusCard
                  label="Bot"
                  value={status?.bot?.status || 'unknown'}
                  detail={`Lock: ${status?.bot?.lock?.healthy ? 'healthy' : 'stale'}`}
                />
                <StatusCard
                  label="Bridge"
                  value={status?.bridge?.status || 'unknown'}
                  detail={`Packets: ${status?.bridge?.packetCount ?? 'n/a'}`}
                />
                <StatusCard
                  label="Task Bus"
                  value={status?.taskbus?.status || 'ok'}
                  detail={`Approvals: ${status?.taskbus?.pendingApprovals ?? 'n/a'}`}
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
