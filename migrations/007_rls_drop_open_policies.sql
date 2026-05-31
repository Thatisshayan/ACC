-- Migration 007: Replace open RLS policies with deny-by-default
--
-- WHY: The "service all" policies (USING true) created in migrations 001-006
-- allow ANY anon-key user to read/write all rows, bypassing intended isolation.
--
-- HOW IT WORKS:
--   - The Supabase service_role key bypasses RLS entirely (server-side is unaffected).
--   - Removing all policies = anon/authenticated users are DENIED by default.
--   - User-scoped SELECT policies are added for tables where the user_id column
--     is a Supabase auth UUID so auth.uid() comparisons are valid.
--   - Tables used only by the server (audit, approvals, outreach) get no policy
--     (deny-all for direct anon/authenticated DB access).
--
-- SAFE TO RE-RUN: DROP POLICY IF EXISTS is idempotent.

-- ── 1. Drop all existing open policies ───────────────────────────────────────

DROP POLICY IF EXISTS "service all" ON acc_tasks;
DROP POLICY IF EXISTS "service all" ON acc_results;
DROP POLICY IF EXISTS "service all" ON acc_users;
DROP POLICY IF EXISTS "service all" ON acc_agent_memory;
DROP POLICY IF EXISTS "service all" ON acc_card_requests;
DROP POLICY IF EXISTS "service all" ON acc_subscriptions;
DROP POLICY IF EXISTS "service all" ON acc_email_credentials;
DROP POLICY IF EXISTS "service all" ON acc_sent_emails;
DROP POLICY IF EXISTS "service all" ON acc_resumes;
DROP POLICY IF EXISTS "service all" ON acc_autonomy_loops;
DROP POLICY IF EXISTS "service all" ON acc_loop_runs;
DROP POLICY IF EXISTS "service all" ON acc_roles;
DROP POLICY IF EXISTS "service all" ON acc_approvals;
DROP POLICY IF EXISTS "service all" ON acc_audit_log;
DROP POLICY IF EXISTS "service all" ON acc_outreach_leads;

-- ── 2. User-scoped read policies ─────────────────────────────────────────────
-- Applied only to tables where user_id is a Supabase auth UUID.
-- The server always uses the service_role key and bypasses these.
-- These policies govern direct Supabase client (anon/authenticated) access.

-- acc_email_credentials: user can only read their own credentials
CREATE POLICY IF NOT EXISTS "owner reads own email credentials"
  ON acc_email_credentials
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "owner writes own email credentials"
  ON acc_email_credentials
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- acc_resumes: user can only read their own resume
CREATE POLICY IF NOT EXISTS "owner reads own resume"
  ON acc_resumes
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "owner writes own resume"
  ON acc_resumes
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ── 3. Tables with no client access (server-only) ────────────────────────────
-- No policies added → Supabase denies all non-service-role access by default.
-- Covers: acc_tasks, acc_results, acc_users, acc_agent_memory, acc_card_requests,
--         acc_subscriptions, acc_sent_emails, acc_autonomy_loops, acc_loop_runs,
--         acc_roles, acc_approvals, acc_audit_log, acc_outreach_leads.
--
-- When the app adds JWT-authenticated client flows, add scoped policies here.
