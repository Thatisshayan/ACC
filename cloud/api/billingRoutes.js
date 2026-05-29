'use strict';
// cloud/api/billingRoutes.js — ACC Subscription Billing
// Mount: app.use('/api/billing', require('./api/billingRoutes'))
//
// Tiers:
//   Starter  — $19/mo  — outreach, tasks, dashboard
//   Builder  — $49/mo  — + Twilio phone, agent credit card, Synapse
//   Operator — $99/mo  — + all features, priority support, white-label
//
// Env vars needed:
//   STRIPE_API_KEY            — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET     — whsec_...
//   STRIPE_PRICE_STARTER      — price_... (Stripe price ID for Starter)
//   STRIPE_PRICE_BUILDER      — price_... (Stripe price ID for Builder)
//   STRIPE_PRICE_OPERATOR     — price_... (Stripe price ID for Operator)
//   ACC_PUBLIC_URL            — https://acccommand.center (for redirect URLs)

const express = require('express');
const router  = express.Router();
const { log } = require('../utils/logger.js');
const { saveSubscription, loadSubscriptions } = require('../storage/supabaseMemory.js');

// In-memory subscription store — seeded from Supabase on startup
const subscriptions = new Map();

// Seed from Supabase (non-blocking, runs after module loads)
setImmediate(() => {
  loadSubscriptions().then(rows => {
    rows.forEach(row => {
      subscriptions.set(row.email, {
        tier:                   row.tier,
        stripeCustomerId:       row.stripe_customer_id,
        stripeSubscriptionId:   row.stripe_subscription_id,
        status:                 row.status,
        updatedAt:              row.updated_at,
      });
    });
    if (rows.length) log(`[billing] Loaded ${rows.length} subscriptions from Supabase.`);
  }).catch(() => {});
});

const PLANS = {
  starter: {
    name:        'Starter',
    price:       19,
    priceId:     () => process.env.STRIPE_PRICE_STARTER,
    description: 'Outreach pipeline, task management, dashboard',
    features:    ['Outreach pipeline', 'Task management', 'Dashboard UI', 'Telegram bot', '30 tasks/hr'],
  },
  builder: {
    name:        'Builder',
    price:       49,
    priceId:     () => process.env.STRIPE_PRICE_BUILDER,
    description: 'Everything in Starter + phone connector, agent credit card, Synapse',
    features:    ['Everything in Starter', 'Twilio phone connector', 'Agent credit card (Privacy.com)', 'Synapse multi-agent', 'Priority queue'],
  },
  operator: {
    name:        'Operator',
    price:       99,
    priceId:     () => process.env.STRIPE_PRICE_OPERATOR,
    description: 'Full access + white-label + priority support',
    features:    ['Everything in Builder', 'White-label dashboard', 'Custom domain support', 'Priority support', 'Unlimited tasks'],
  },
};

function stripe() {
  const key = process.env.STRIPE_API_KEY;
  if (!key) throw new Error('STRIPE_API_KEY not set.');
  return require('stripe')(key);
}

function baseUrl() {
  return process.env.ACC_PUBLIC_URL || 'https://acccommand.center';
}

// GET /api/billing/plans
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLANS).map(([id, p]) => ({
    id,
    name:        p.name,
    price:       p.price,
    description: p.description,
    features:    p.features,
    configured:  !!p.priceId(),
  }));
  return res.json({ success: true, plans });
});

// POST /api/billing/checkout  — { email, plan: 'starter'|'builder'|'operator' }
router.post('/checkout', async (req, res) => {
  const { email, plan } = req.body || {};
  if (!email || !plan) return res.status(400).json({ success: false, error: 'email and plan are required.' });
  if (!PLANS[plan]) return res.status(400).json({ success: false, error: `Invalid plan. Choose: ${Object.keys(PLANS).join(', ')}` });

  const priceId = PLANS[plan].priceId();
  if (!priceId) {
    return res.status(503).json({ success: false, error: `STRIPE_PRICE_${plan.toUpperCase()} not configured. Add it to Railway env vars.` });
  }

  try {
    const s = stripe();
    const session = await s.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      customer_email:     email,
      line_items:         [{ price: priceId, quantity: 1 }],
      success_url:        `${baseUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:         `${baseUrl()}/billing`,
      metadata:           { plan, email },
      subscription_data:  { metadata: { plan, email } },
    });
    log(`[billing] Checkout session created for ${email} — ${plan}`);
    return res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/billing/subscription/:email — check subscription status
router.get('/subscription/:email', (req, res) => {
  const sub = subscriptions.get(req.params.email.toLowerCase());
  if (!sub) return res.json({ success: true, active: false, tier: null });
  return res.json({ success: true, active: sub.status === 'active', tier: sub.tier, status: sub.status, updatedAt: sub.updatedAt });
});

// POST /api/billing/webhook — Stripe sends events here
// Set in Stripe dashboard: Developers → Webhooks → Add endpoint → /api/billing/webhook
// Events to listen for: customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (secret && sig) {
      event = stripe().webhooks.constructEvent(req.body, sig, secret);
    } else {
      event = JSON.parse(req.body);
      log('[billing] Webhook secret not set — skipping signature verification.');
    }
  } catch (e) {
    return res.status(400).json({ error: `Webhook signature failed: ${e.message}` });
  }

  const sub = event.data?.object;

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const email = sub.metadata?.email || sub.customer_email;
      const plan  = sub.metadata?.plan || 'starter';
      if (email) {
        const record = {
          tier:                   plan,
          stripeCustomerId:       sub.customer,
          stripeSubscriptionId:   sub.id,
          status:                 sub.status,
          updatedAt:              new Date().toISOString(),
        };
        subscriptions.set(email.toLowerCase(), record);
        saveSubscription({ email, ...record }).catch(() => {});
        log(`[billing] Subscription ${sub.status} — ${email} → ${plan}`);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const email = sub.metadata?.email || sub.customer_email;
      if (email) {
        const existing = subscriptions.get(email.toLowerCase());
        if (existing) {
          existing.status    = 'cancelled';
          existing.updatedAt = new Date().toISOString();
        }
        log(`[billing] Subscription cancelled — ${email}`);
      }
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

// GET /api/billing/status — config health check
router.get('/status', (req, res) => {
  return res.json({
    success: true,
    stripe:    !!process.env.STRIPE_API_KEY,
    webhook:   !!process.env.STRIPE_WEBHOOK_SECRET,
    prices: {
      starter:  !!process.env.STRIPE_PRICE_STARTER,
      builder:  !!process.env.STRIPE_PRICE_BUILDER,
      operator: !!process.env.STRIPE_PRICE_OPERATOR,
    },
    activeSubscriptions: subscriptions.size,
  });
});

// Exported helper for other routes to check tier
function getTier(email) {
  if (!email) return null;
  const sub = subscriptions.get(email.toLowerCase());
  if (!sub || sub.status !== 'active') return null;
  return sub.tier;
}

module.exports = router;
module.exports.getTier = getTier;
module.exports.PLANS   = PLANS;
