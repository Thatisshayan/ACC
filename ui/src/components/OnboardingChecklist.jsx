import React, { useState, useEffect } from 'react';

const STEPS = [
  {
    id: 'telegram',
    icon: '📱',
    title: 'Connect Telegram',
    desc: 'Message @OurAccbot to activate your agent interface.',
    action: { label: 'Open Telegram', href: 'https://t.me/OurAccbot' },
  },
  {
    id: 'goal',
    icon: '🎯',
    title: 'Set your first goal',
    desc: 'Send any command to the bot — e.g. "search for PM jobs in Toronto".',
    action: null,
  },
  {
    id: 'dashboard',
    icon: '📊',
    title: 'Explore the dashboard',
    desc: 'Check Tasks, Approvals, and Agents to understand what\'s running.',
    action: null,
  },
  {
    id: 'billing',
    icon: '💳',
    title: 'Choose a plan',
    desc: 'Unlock outreach, Synapse multi-agent, and the agent credit card.',
    action: { label: 'View plans', href: '/api/billing/plans', external: false },
  },
];

const LS_KEY = 'acc_onboarding_v1';

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}

export default function OnboardingChecklist({ onDismiss }) {
  const [done, setDone] = useState(loadProgress);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(LS_KEY + '_dismissed') === '1');

  const completedCount = STEPS.filter(s => done[s.id]).length;
  const allDone = completedCount === STEPS.length;

  function toggle(id) {
    setDone(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function dismiss() {
    localStorage.setItem(LS_KEY + '_dismissed', '1');
    setDismissed(true);
    if (onDismiss) onDismiss();
  }

  if (dismissed && !allDone) return null;

  return (
    <div className="rounded-3xl border border-acc-green/20 bg-acc-green/[0.03] p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-acc-green/60 mb-1">Getting started</div>
          <h3 className="text-base font-semibold text-white">
            {allDone ? '✓ Setup complete' : `Onboarding — ${completedCount}/${STEPS.length} done`}
          </h3>
          {!allDone && (
            <div className="mt-1.5 h-1 w-40 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-acc-green transition-all duration-500"
                style={{ width: `${(completedCount / STEPS.length) * 100}%` }}
              />
            </div>
          )}
        </div>
        {!allDone && (
          <button
            onClick={dismiss}
            className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors shrink-0"
          >
            Dismiss
          </button>
        )}
      </div>

      <div className="space-y-2">
        {STEPS.map(step => (
          <div
            key={step.id}
            className={`flex items-start gap-3 rounded-2xl border p-4 transition-all duration-200
              ${done[step.id]
                ? 'border-acc-green/15 bg-acc-green/[0.04] opacity-60'
                : 'border-white/[0.06] bg-black/20 hover:border-white/[0.1]'
              }`}
          >
            <button
              onClick={() => toggle(step.id)}
              className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all
                ${done[step.id]
                  ? 'border-acc-green bg-acc-green text-black'
                  : 'border-zinc-600 bg-transparent hover:border-acc-green/50'
                }`}
            >
              {done[step.id] && <span className="text-[9px] font-bold leading-none">✓</span>}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">{step.icon}</span>
                <span className={`text-sm font-medium ${done[step.id] ? 'line-through text-zinc-500' : 'text-white'}`}>
                  {step.title}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{step.desc}</p>
            </div>
            {step.action && !done[step.id] && (
              <a
                href={step.action.href}
                target={step.action.external !== false ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg border border-acc-green/25 bg-acc-green/10 px-3 py-1.5 text-[11px] font-medium text-acc-green hover:bg-acc-green/18 transition-colors"
              >
                {step.action.label}
              </a>
            )}
          </div>
        ))}
      </div>

      {allDone && (
        <div className="text-center py-2">
          <div className="text-acc-green text-sm font-semibold">All set. Your agents are ready.</div>
          <button onClick={dismiss} className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            Hide checklist
          </button>
        </div>
      )}
    </div>
  );
}
