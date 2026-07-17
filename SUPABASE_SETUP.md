# ACC Supabase Setup — SQL Tables

**Status:** ⚠️ REQUIRED BEFORE PRODUCTION

Run this SQL in your Supabase dashboard: https://supabase.com/dashboard/project/wfgdewzrnrjthugpgeey/sql/new

Copy the entire block below, paste in the SQL editor, and click **RUN**.

---

## SQL Schema Creation

```sql
-- Memory table (agent state storage)
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

-- Card requests table (virtual card tracking)
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

-- Subscriptions table (billing tier tracking)
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

-- Waitlist table (landing page signups)
CREATE TABLE IF NOT EXISTS acc_waitlist (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE acc_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service insert" ON acc_waitlist FOR INSERT WITH CHECK (true);
```

---

## Steps to Execute

1. Go to: https://supabase.com/dashboard/project/wfgdewzrnrjthugpgeey/sql/new
2. Delete any default placeholder text
3. Paste the entire SQL block above
4. Click the **RUN** button (bottom right)
5. You should see 4 tables created + policies applied
6. Test: Go to the **Table Editor** and you should see all 4 new tables listed

---

## Verify Success

After running the SQL:
- ✅ `acc_agent_memory` table exists
- ✅ `acc_card_requests` table exists
- ✅ `acc_subscriptions` table exists
- ✅ `acc_waitlist` table exists
- ✅ All have RLS policies enabled

Then try running locally:
```bash
npm start
```

If you see no database errors on startup, the tables are working.

---

## Retrieve Your Service Role Key (After Tables Created)

Once tables are created, get your service role key:

1. Go to: https://supabase.com/dashboard/project/wfgdewzrnrjthugpgeey/settings/api
2. Under "Service Role" section, copy the **API Key**
3. Update your `.env` file:
   ```
   SUPABASE_SERVICE_ROLE_KEY=<paste_the_key_here>
   ```
4. Restart `npm start`

---

## Troubleshooting

**Q: I see "RLS policy violation" errors**
A: The policies are set to `USING (true)` which means service role can access. Make sure you're using SUPABASE_SERVICE_ROLE_KEY, not SUPABASE_ANON_KEY.

**Q: Tables created but npm start still fails**
A: Restart your terminal and `npm start` again. Node sometimes needs a fresh require of dotenv.

**Q: I don't have Supabase access**
A: You need to create a project at https://supabase.com. It's free. Then use the project URL + keys in `.env`.
