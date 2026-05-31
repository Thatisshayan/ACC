import React, { useEffect, useState } from 'react';
import api from '../api.js';

const shell = 'rounded-[28px] border border-white/[0.07] bg-white/[0.04] backdrop-blur-xl';

function Badge({ tone = 'slate', children }) {
  const map = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    amber:   'border-amber-500/20   bg-amber-500/10   text-amber-300',
    red:     'border-red-500/20     bg-red-500/10     text-red-300',
    slate:   'border-white/[0.08]   bg-white/[0.04]   text-zinc-300',
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${map[tone] || map.slate}`}>
      {children}
    </span>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 pb-24 md:p-6 md:pb-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className={`${shell} p-6 animate-pulse`}>
          <div className="h-4 w-32 bg-white/[0.06] rounded-full mb-3" />
          <div className="h-8 w-64 bg-white/[0.06] rounded-full mb-2" />
          <div className="h-3 w-80 bg-white/[0.04] rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className={`${shell} p-6 animate-pulse`}>
              <div className="h-4 w-20 bg-white/[0.06] rounded-full mb-4" />
              <div className="h-8 w-16 bg-white/[0.06] rounded-full mb-2" />
              <div className="h-3 w-28 bg-white/[0.04] rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorShell({ message, onRetry }) {
  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 pb-24 md:p-6 md:pb-6 flex items-center justify-center">
      <div className={`${shell} p-10 text-center max-w-md mx-auto`}>
        <div className="text-3xl mb-4 opacity-50">⚠</div>
        <div className="text-sm font-semibold text-red-400 mb-2">Failed to load billing</div>
        <div className="text-xs text-zinc-500 mb-6 leading-relaxed">{message}</div>
        <button onClick={onRetry}
          className="px-4 py-2 rounded-xl border border-white/[0.10] bg-white/[0.04] text-xs text-zinc-200 hover:bg-white/[0.08] transition-colors">
          Retry
        </button>
      </div>
    </div>
  );
}

export default function Billing() {
  const [plans,  setPlans]  = useState(null);
  const [status, setStatus] = useState(null);
  const [err,    setErr]    = useState(null);
  const [busy,   setBusy]   = useState(null); // plan id being checked out

  async function load() {
    setErr(null);
    try {
      // /api/billing/plans is public — no auth needed
      const planRes = await api.get('/billing/plans').then(r => r.data);
      setPlans(Array.isArray(planRes.plans) ? planRes.plans : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Network error');
      return;
    }
    try {
      // /api/billing/status requires auth
      const statRes = await api.get('/billing/status').then(r => r.data);
      setStatus(statRes);
    } catch {
      // status is optional — don't block page on auth failure
      setStatus(null);
    }
  }

  useEffect(() => { load(); }, []);

  async function checkout(planId) {
    const email = prompt('Enter your email to start checkout:');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setBusy(planId);
    try {
      const res = await api.post('/billing/checkout', { email, plan: planId }).then(r => r.data);
      if (res.url) {
        window.location.href = res.url;
      } else {
        alert(res.error || 'Checkout failed — no URL returned');
      }
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Checkout failed');
    } finally {
      setBusy(null);
    }
  }

  if (!plans && !err) return <LoadingShell />;
  if (err) return <ErrorShell message={err} onRetry={load} />;

  const stripeConfigured = status?.stripe ?? false;
  const webhookConfigured = status?.webhook ?? false;

  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 pb-24 md:p-6 md:pb-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className={`${shell} overflow-hidden`}>
          <div className="relative p-5 md:p-7">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_38%)]" />
            <div className="relative">
              <Badge tone="emerald">Billing</Badge>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                Plans &amp; Subscription
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Choose a plan to activate ACC features. All plans include the command center dashboard and Telegram bot.
              </p>
            </div>
          </div>
        </div>

        {/* Config health — only shown to authenticated users */}
        {status && (
          <div className={`${shell} p-5 flex flex-wrap gap-4 items-center`}>
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Integration status</span>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${stripeConfigured ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="text-xs text-zinc-400">Stripe API key</span>
                <Badge tone={stripeConfigured ? 'emerald' : 'red'}>{stripeConfigured ? 'configured' : 'missing'}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${webhookConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-xs text-zinc-400">Webhook secret</span>
                <Badge tone={webhookConfigured ? 'emerald' : 'amber'}>{webhookConfigured ? 'configured' : 'missing'}</Badge>
              </div>
              {status.prices && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-400">Price IDs</span>
                  <Badge tone={Object.values(status.prices).some(Boolean) ? 'emerald' : 'amber'}>
                    {Object.values(status.prices).filter(Boolean).length}/{Object.values(status.prices).length} set
                  </Badge>
                </div>
              )}
              {typeof status.activeSubscriptions === 'number' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-400">Active subs</span>
                  <Badge tone="slate">{status.activeSubscriptions}</Badge>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Plans */}
        {plans.length === 0 ? (
          <div className={`${shell} p-10 text-center text-zinc-500 text-sm`}>
            No plans configured. Add STRIPE_PRICE_STARTER, STRIPE_PRICE_BUILDER, STRIPE_PRICE_OPERATOR to Railway env.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((plan) => {
              const priceConfigured = plan.configured !== false;
              return (
                <div key={plan.id} className={`${shell} p-6 flex flex-col`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{plan.id}</div>
                    {!priceConfigured && (
                      <Badge tone="amber">setup required</Badge>
                    )}
                  </div>
                  <div className="text-xl font-bold text-white mb-1">{plan.name}</div>
                  <div className="text-3xl font-semibold text-white mb-1">
                    ${plan.price}
                    <span className="text-sm font-normal text-zinc-500">/mo</span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-5 leading-relaxed">{plan.description}</p>
                  <ul className="space-y-2 mb-6 flex-1">
                    {(plan.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
                        <span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => priceConfigured && checkout(plan.id)}
                    disabled={busy === plan.id || !priceConfigured}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all
                      ${priceConfigured
                        ? 'border border-[#1aff8c]/25 bg-[#1aff8c]/10 text-[#1aff8c] hover:bg-[#1aff8c]/20 disabled:opacity-50'
                        : 'border border-white/[0.06] bg-white/[0.02] text-zinc-600 cursor-not-allowed'
                      }`}
                  >
                    {busy === plan.id ? 'Redirecting…' : priceConfigured ? 'Subscribe' : 'Price ID not set'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Honesty note */}
        <div className={`${shell} p-5`}>
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600 mb-2">Note</div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Checkout redirects to Stripe. No card data passes through ACC servers.
            To activate plans, set STRIPE_PRICE_* env vars in Railway and configure a webhook endpoint in the Stripe dashboard pointing to{' '}
            <code className="text-zinc-400 bg-black/30 px-1 rounded">/api/billing/webhook</code>.
          </p>
        </div>

      </div>
    </div>
  );
}
