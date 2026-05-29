# ACC Activation Checklist
Generated: 2026-05-29

Everything below is ready to copy-paste. Do in order.

---

## STEP 1 — Supabase (5 min)
Go to: https://supabase.com/dashboard/project/xacfnatsovuxqttnzdaw/sql/new
Paste this entire block and click RUN:

```sql
-- Memory table
CREATE TABLE IF NOT EXISTS acc_agent_memory (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scope      TEXT NOT NULL DEFAULT 'global',
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'system',
  importance INT  NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(scope, key)
);
ALTER TABLE acc_agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service all" ON acc_agent_memory USING (true) WITH CHECK (true);

-- Card requests table
CREATE TABLE IF NOT EXISTS acc_card_requests (
  id           UUID PRIMARY KEY,
  agent        TEXT    NOT NULL,
  purpose      TEXT    NOT NULL,
  amount       NUMERIC NOT NULL,
  amount_cents INT     NOT NULL,
  merchant     TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending',
  card_data    JSONB,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE acc_card_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service all" ON acc_card_requests USING (true) WITH CHECK (true);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS acc_subscriptions (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email                  TEXT UNIQUE NOT NULL,
  tier                   TEXT NOT NULL DEFAULT 'starter',
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE acc_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service all" ON acc_subscriptions USING (true) WITH CHECK (true);

-- Waitlist table (if not already created)
CREATE TABLE IF NOT EXISTS acc_waitlist (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE acc_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service insert" ON acc_waitlist FOR INSERT WITH CHECK (true);
```

---

## STEP 2 — Railway env vars (5 min)
Go to: https://railway.app → your ACC service → Variables
Add each of these (click + New Variable for each):

```
ACC_PUBLIC_URL          = https://acccommand.center
BROWSER_SANDBOX         = false
```

After you get the keys from Step 4 accounts, come back and add:
```
PRIVACY_API_KEY         = (from privacy.com)
TWILIO_ACCOUNT_SID      = (from console.twilio.com)
TWILIO_AUTH_TOKEN       = (from console.twilio.com)
TWILIO_PHONE_NUMBER     = (format: +16135551234)
STRIPE_API_KEY          = (sk_live_... or sk_test_...)
STRIPE_PRICE_STARTER    = (price_... from Stripe dashboard)
STRIPE_PRICE_BUILDER    = (price_... from Stripe dashboard)
STRIPE_PRICE_OPERATOR   = (price_... from Stripe dashboard)
STRIPE_WEBHOOK_SECRET   = (whsec_... from Stripe webhooks)
```

---

## STEP 3 — Railway custom domain (3 min)
1. Go to: https://railway.app → your ACC service → Settings → Custom Domains
2. Click "Add Custom Domain"
3. Type: acccommand.center
4. Railway shows you a CNAME value like: `xxxxx.up.railway.app`
5. Copy that CNAME value — you need it for Step 3b

**Step 3b — DNS at your domain registrar:**
Log into wherever you bought acccommand.center (Namecheap / GoDaddy / Cloudflare / etc.)
Add these DNS records:

| Type  | Name | Value                        | TTL  |
|-------|------|------------------------------|------|
| CNAME | @    | (paste Railway CNAME value)  | Auto |
| CNAME | www  | (paste Railway CNAME value)  | Auto |

SSL certificate provisions automatically within 2 minutes of DNS propagating.
DNS propagation takes 5-30 min typically.

Test with: https://acccommand.center/api/health → should return { "ok": true }

---

## STEP 4 — Third-party accounts (15 min total)

### Privacy.com (Agent Credit Card)
1. Go to: https://privacy.com → Sign up (free)
2. Link a debit card/bank account (required to issue virtual cards)
3. Go to: Account → Developer → API Keys → Create Key
4. Copy the key → add as PRIVACY_API_KEY in Railway

### Twilio (Phone connector)
1. Go to: https://console.twilio.com → Sign up (free trial, ~$15 credit)
2. Dashboard shows Account SID and Auth Token at the top → copy both
3. Go to: Phone Numbers → Manage → Buy a Number → search Canada/US → buy one (~$1.15/mo)
4. On the number's config page set:
   - "A Message Comes In" → Webhook → https://acccommand.center/api/phone/webhook/sms
   - "A Call Comes In"    → Webhook → https://acccommand.center/api/phone/webhook/voice
5. Add all 3 values to Railway env vars

### Stripe (Billing)
1. Go to: https://dashboard.stripe.com → Sign up (free)
2. Developers → API Keys → copy Secret key → STRIPE_API_KEY
3. Products → + Add Product → create 3:
   - Name: "ACC Starter"  → Price: $19.00/month recurring → copy Price ID → STRIPE_PRICE_STARTER
   - Name: "ACC Builder"  → Price: $49.00/month recurring → copy Price ID → STRIPE_PRICE_BUILDER
   - Name: "ACC Operator" → Price: $99.00/month recurring → copy Price ID → STRIPE_PRICE_OPERATOR
4. Developers → Webhooks → + Add endpoint:
   - URL: https://acccommand.center/api/billing/webhook
   - Events: customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
   - Copy Signing secret → STRIPE_WEBHOOK_SECRET

---

## STEP 5 — Verify everything is live
Run these URLs in your browser after DNS propagates:

- https://acccommand.center/api/health         → { "ok": true }
- https://acccommand.center/api/billing/status → { "stripe": true }
- https://acccommand.center/api/phone/status   → { "configured": true }
- https://acccommand.center/api/card/status    → { "configured": true }
- https://acccommand.center/landing            → landing page loads

All green = ACC is fully live on acccommand.center.
