import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'acc_onboarding_progress_v1';

const STEPS = [
  { id: 'profile_setup', label: 'Profile setup', hint: 'Define your operator identity and core preferences.' },
  { id: 'connect_telegram', label: 'Connect Telegram', hint: 'Link Telegram for alerts and approvals fallback.' },
  { id: 'autonomy_goal', label: 'Autonomy goal', hint: 'Set one recurring execution goal for autonomy loops.' },
  { id: 'upload_resume', label: 'Upload resume', hint: 'Add resume context for job-search and outreach workflows.' },
  { id: 'connect_gmail', label: 'Connect Gmail', hint: 'Enable inbox monitoring and notification summaries.' },
  { id: 'connector_wizard', label: 'Connector wizard', hint: 'Review available integrations and their live status.' },
  { id: 'test_command_wizard', label: 'Test command wizard', hint: 'Run a safe test command through Task Bus.' },
  { id: 'billing_selection', label: 'Billing selection', hint: 'Pick a plan or confirm trial lane before scale-up.' },
];

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function Onboarding() {
  const [progress, setProgress] = useState(loadInitial);

  const doneCount = useMemo(
    () => STEPS.filter((s) => progress[s.id] === true).length,
    [progress]
  );

  function update(next) {
    setProgress(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function toggle(id) {
    update({ ...progress, [id]: !progress[id] });
  }

  return (
    <div className="p-5 sm:p-6 space-y-5 acc-grid-bg min-h-screen">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Guided setup</div>
          <h2 className="text-xl font-bold text-white">Onboarding</h2>
          <p className="text-xs text-zinc-500 mt-1">Progress is stored locally in this session for safe resume.</p>
        </div>
        <span className="text-xs text-zinc-500 border border-white/[0.08] rounded-xl px-3 py-1.5">
          {doneCount}/{STEPS.length} complete
        </span>
      </div>

      <div className="grid gap-3">
        {STEPS.map((step) => {
          const done = progress[step.id] === true;
          return (
            <button
              key={step.id}
              onClick={() => toggle(step.id)}
              className={`text-left rounded-2xl border px-4 py-3 transition-colors ${
                done
                  ? 'border-emerald-500/20 bg-emerald-500/10'
                  : 'border-white/[0.08] bg-black/20 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={`text-sm font-medium ${done ? 'text-emerald-300' : 'text-white'}`}>{step.label}</div>
                  <div className="text-xs text-zinc-500 mt-1">{step.hint}</div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded border ${done ? 'border-emerald-500/20 text-emerald-300' : 'border-zinc-700 text-zinc-500'}`}>
                  {done ? 'done' : 'open'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
