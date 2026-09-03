# Handoff: Post-Security-Sprint Follow-Up (Migrations, Mobile Auth, CI Gaps, Cleanup)

Date: 2026-09-03
From: Claude (Sonnet 5), session on repo `ACC`
To: opencode agent
Status: **Ready to start.** Governance: This repo is governed by `REPO_RULES.md`. Read it if anything here is ambiguous. Where this doc and `REPO_RULES.md` conflict, `REPO_RULES.md` wins.

Related reading, in this order:
1. `audits/2026-09-03_Claude_ComprehensiveAudit_and_LaunchReadiness.md` — the full audit this handoff is drawn from. Sections referenced below (§2.2, §3, §5, §6) are in that file.
2. `docs/governance/DEFERRED_WORK.md` — append-only log of everything found-but-not-fixed across sessions, including today's.
3. `CLAUDE.md` — top section ("2026-09-03 session (Claude)") has a one-paragraph summary of today's security work and links back here.

---

## 0. The actual state of the repo right now

Two PRs merged to `master` today, both closing real, exploitable security bugs:
- **PR #22** — an RCE (unsandboxed `node:vm` escape) + SSRF pair in the assistant's `code.run`/`agent.http` chat intents, reachable by any operator-role API key.
- **PR #24** — a 46-alert pre-existing CodeQL backlog, most seriously an approval-gate bypass in `cloud/hub/events.js` (`event.type: 'constructor'` resolving through the prototype chain to the real `Object` constructor).

Both are done, tested (201 tests passing, `npm test`), and merged. **This handoff is not about those.** It's about the next tier down: real, verified-today gaps that are safe to fix without secrets, production access, or Shayan's direct authorization — the same bar the earlier `HANDOFF_2026-08-01_deployment-readiness-hardening.md` used, which you can look at for the expected format of a completion report.

Every fact below was re-verified against current code today, after the two PRs above merged — line numbers in the audit doc predate this handoff by a few hours and may be stale; the line numbers **in this document** are current.

---

## 1. Ground rules (non-negotiable — from `REPO_RULES.md`)

1. **Never touch `.env`, secrets, or credentials** (R19). No reading, printing, committing, or inventing real values.
2. **No file deletion without Shayan's direct approval** (R14). Task Group D below has a "propose, don't delete" item for exactly this reason.
3. **Never commit directly to the default branch.** Note: `REPO_RULES.md`/`docs/governance/BRANCH_POLICY.md` refer to the protected branch as `main` throughout — **that branch does not exist in this repo.** The real default branch, confirmed via `git branch -r` / `origin/HEAD`, is `master`. Treat every "`main`" in those two docs as "`master`." This mismatch is itself now recorded as a deferred item (§6 below) — don't silently fix the docs as part of this handoff, that's out of scope here, just don't get tripped up by it.
4. **Branch naming** (R27): use `agent/opencode-<short-slug>`, branched fresh from up-to-date `master`.
5. **Commit in coherent increments** (R9), one commit minimum per task group, conventional-commit format (R28): `type(scope): summary`.
6. **No paid API calls or infrastructure spend without approval** (R24).
7. **Do not silently skip anything** (R4). If a task doesn't apply the way this doc describes, say so explicitly in your report — don't quietly route around it.
8. **Open a PR when done. Do not merge it.** Target `master`. Say clearly in your report that the PR is open and unmerged, same as the previous handoff's requirement.
9. **Evidence, not claims** (R3, R38). Every task's completion claim must be backed by real, pasted command output.
10. **Record anything you find but don't fix** in `docs/governance/DEFERRED_WORK.md` (R11, R12), same append-only format already used there — look at the existing entries for the exact style (`` `[DATE] scope: what — why deferred — resume hint — status` ``).

---

## 2. Repo orientation (facts, verified 2026-09-03 — trust these, don't re-derive)

- Default branch is `master` (see rule 3 above — the "main" naming in governance docs is stale).
- `"test"` script in `package.json` runs a fixed list of `.test.js` files via `node --test` / direct `node`. **Any new test file must be appended to that script string or it will never run in CI.**
- `.github/workflows/gate.yml` implements the required `secret-scan`/`build`/`test`/`doc-freshness`/`deploy-dry` checks (R30). `.github/workflows/ci.yml` is a **separate**, lighter workflow that currently does syntax checks and module-load smoke tests only — see Task Group C, it does not run `npm test` at all right now.
- `claude-review` (a GitHub Action check, separate from both of the above) will show red on your PR — this is expected and does not block merging. It fails because the `ANTHROPIC_API_KEY` repo secret isn't configured; this is a repo-settings gap, not something fixable in a PR. Documented in the audit doc §7. Ignore it.
- CodeQL and Codacy checks may also show findings. If you introduce new code, expect them to flag it if it does anything resembling "user input reaches a filesystem path / outbound URL / dynamic property lookup" — even when your fix is correct, these tools frequently don't recognize custom validation functions as sanitizers. See `docs/SECURITY_CODEEXEC.md` and the audit doc §0.1 for how today's session handled this class of false positive (documented reasoning, not silently ignored). If you hit one, use the same judgment: verify with a real test that the code is actually safe, then explain why in your PR description rather than contorting the code to satisfy a static-analysis heuristic.
- `scripts/migrate.js:83-95` applies every file under `migrations/` in `fs.readdirSync(...).sort()` order (alphabetic, which is numeric here since they're zero-padded) and `throw`s on the first failure — it does not skip ahead or retry out of order.

---

## Task Group A — Fix the migration-ordering bug (blocks every fresh Supabase project)

**Why this matters:** `scripts/migrate.js` stops dead on the first failing file. On a brand-new Supabase project, migration `003` is that failure, and nothing after it ever runs. This is the concrete, root-caused reason a "run SQL tables on new Supabase project" task has been stuck open across multiple sessions (see `CLAUDE.md`'s "What's Pending" list).

**The bug**, both files currently in full:

`migrations/003_waitlist_columns.sql` (3 lines of SQL):
```sql
ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS automate TEXT;
ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS role     TEXT;
ALTER TABLE acc_waitlist ADD COLUMN IF NOT EXISTS control  TEXT;
```
This runs against a table that doesn't exist yet on a fresh database.

`migrations/009_waitlist_base.sql` is what actually creates `acc_waitlist`:
```sql
CREATE TABLE IF NOT EXISTS acc_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  automate    TEXT,
  role        TEXT,
  control     TEXT,
  source      TEXT NOT NULL DEFAULT 'landing',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_waitlist_email      ON acc_waitlist(email);
CREATE INDEX IF NOT EXISTS idx_acc_waitlist_created_at ON acc_waitlist(created_at);

ALTER TABLE acc_waitlist ENABLE ROW LEVEL SECURITY;
```

**The fix** — do NOT rename or renumber either file (migration tracking may be filename-keyed; renaming an already-applied migration on any existing environment is exactly the kind of thing that breaks silently). Instead, make `003` self-sufficient:

1. Add a `CREATE TABLE IF NOT EXISTS acc_waitlist (...)` statement (just the table shape — `id`, `email`, `source`, `created_at`; you can omit `automate`/`role`/`control` from the `CREATE TABLE` itself since `003`'s own `ALTER TABLE ADD COLUMN IF NOT EXISTS` lines immediately below will add them either way) to the **top** of `003_waitlist_columns.sql`, before the three `ALTER TABLE` lines.
2. Leave `009_waitlist_base.sql` untouched. Its `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `ENABLE ROW LEVEL SECURITY` are all idempotent — running it again after `003` already created the table is a safe no-op. This also means an environment that already ran migrations in the old broken order (i.e. never got past `003`) will now succeed on `003`, then hit `009` later and have it no-op cleanly — no double-creation, no error.
3. **Verify, don't just assert**: you won't have real Supabase credentials to run this against a live database (don't try — R19/R24). Instead, verify by static SQL reasoning: read every one of `migrations/001` through `009` in order and confirm no other migration file references `acc_waitlist` in a way that would break with this change (check for any other `ALTER TABLE acc_waitlist` or foreign-key reference across all 9 files). Paste that grep and its (empty, expected) result in your report.
4. Update `scripts/verify-migration-coverage.js` if it has any special-cased knowledge of migration `003`/`009` that this change would invalidate — read that script first, it's a shallow text-grep checker (documented as such in the audit doc §6 item 4), so it likely won't even notice this change either way; if so, say so in your report rather than assuming.

---

## Task Group B — Mobile app: add an actual auth story

**Why this matters:** verified today, `mobile/src/lib/api.ts:5-13`'s `request()` sends `{'Content-Type': 'application/json', ...init.headers}` and nothing else — no `Authorization` header exists anywhere in the file. Every endpoint it calls (`/api/status`, `/api/assistant/*`, `/api/messages/*`, `/api/taskbus/*`, `/api/hub/register` — see `mobile/src/lib/api.ts:36-176`) is gated behind `requireOperatorOrAdmin` or `requireServiceOperatorOrAdmin` in `cloud/server.js:299-334`. As shipped, the mobile app 401s on essentially every real backend call. This isn't a wiring bug where a token exists somewhere and just isn't attached — `mobile/src/lib/session.tsx` (lines 6-9, 27-34) only stores `currentUserId` and `apiBaseUrl`. **The credential concept doesn't exist in the mobile app's session model at all yet.** This is a real feature gap, not a one-line fix.

1. Read `cloud/middleware/auth.js` (`requireOperatorOrAdmin`) to understand exactly what it accepts — a `Bearer <token>` header matched against `ACC_OPERATOR_API_KEY`/`ACC_ADMIN_API_KEY` env vars (comma-separated lists, see `readConfiguredPrincipals()`).
2. Extend `mobile/src/lib/session.tsx`'s stored session shape to also hold an API key/token field (use `expo-secure-store` or whatever the existing `SecureStore` usage in that file already relies on — the earlier frontend audit confirmed session data is already stored via `SecureStore` correctly, not plaintext `AsyncStorage`; keep that pattern for the new field).
3. Add a settings/login screen (check `mobile/app/(tabs)/settings.tsx` — it already exists and has `saveSession`/`clearSession` per the file tree in the earlier audit) where a user pastes in their operator/admin key. This is a personal-use app (single operator, per `CLAUDE.md`), not a multi-tenant signup flow — a simple "paste your API key" field in Settings is the right scope, not a full auth system.
4. Update `mobile/src/lib/api.ts`'s `request()` to read the stored key from the session and attach `Authorization: Bearer <key>` to every request, matching how `ui/src/api.js`'s existing (working) request interceptor does it — read that file for the pattern to mirror, since it already solves this problem correctly for the web UI.
5. Handle the "no key configured yet" case gracefully — don't crash, show a clear "add your API key in Settings" state instead of a raw 401.
6. This repo has no existing mobile test infra to extend (confirmed no `mobile/**/*.test.*` files) — don't invent a testing framework as part of this task. Verify manually as best you can (e.g. `npx tsc --noEmit` in `mobile/` to confirm no type errors from your changes) and say plainly in your report that this wasn't covered by automated tests, per R3/R16 (state what was and wasn't verified, don't imply more than you checked).

---

## Task Group C — CI gaps: make `ci.yml` actually run the test suite, fix `gate.yml`'s branch target

Two small, independent, high-value fixes:

1. **`.github/workflows/ci.yml`** (the `backend` job) currently only runs `node --check <file>` syntax checks and standalone `node -e "require(...)"` module-load smoke tests (lines 24-49) — it never calls `npm test`. Add a step that runs `npm test` (after the existing `npm ci` install step) so the real ~30-file test suite actually executes on every push/PR, not just on a manual local run. Keep the existing syntax-check/module-load steps too — they're cheap and catch a different failure class (they'd have caught the historical `twilio`/`openai` missing-dependency incidents faster than a full test run would).
2. **`.github/workflows/gate.yml`**: its `pull_request` trigger targets `branches: [main]`, which doesn't exist (see §2 above — real default branch is `master`). Change it to `master`. This is the actual required-checks gate per `docs/governance/BRANCH_POLICY.md` (R30) — right now it only reliably fires on pushes, not PRs, which undermines the whole point of PR-gated merging. **Do not touch `REPO_RULES.md` or `BRANCH_POLICY.md` themselves as part of this fix** — updating their "main" → "master" references repo-wide is a bigger, separate doc-consistency pass, out of scope here; just fix the one workflow file that actually controls real CI behavior.
3. Verify by pushing your branch and confirming (paste the `gh pr checks <your-pr-number>` output, or equivalent) that `gate` actually triggers and runs on your own PR — that's the real proof this fix works, not just that the YAML is syntactically valid.

---

## Task Group D — Frontend cleanup: remove the dead, spoofable-auth API client

**Why this matters:** verified today, `ui/src/lib/api.js`'s `taskbusApi` object (lines 39-55) never attaches the admin bearer token the working client (`ui/src/api.js`) does — it only sets a spoofable `x-approver: 'Shayan'` header on approve/reject, and nothing at all on read endpoints. It's currently **fully unreachable dead code**: its only consumer, `ui/src/hooks/useProviders.js`, is itself imported nowhere across `ui/src` (confirmed via repo-wide grep today). `getRuntimeApiBaseUrl` (also exported from `lib/api.js`) and `useSocket.js` (a plain WebSocket wrapper, no HTTP/auth involved) are separate, legitimate, actively-used exports from the same file/directory — **do not remove those**, only the `taskbusApi` object and anything that exists solely to support it.

1. Confirm the dead-code finding still holds before touching anything: `grep -rn "useProviders" ui/src` should return only the hook's own definition file, nothing importing it. Paste that output.
2. Delete `ui/src/hooks/useProviders.js` and the `taskbusApi` export (and any helper only used by it) from `ui/src/lib/api.js`, keeping `getRuntimeApiBaseUrl` and everything else in that file intact.
3. **This is a file deletion — R14 requires Shayan's direct approval first.** Do not delete `useProviders.js` outright. Instead: leave the file in place, but add a clear top-of-file comment marking it dead code with today's date and a reference to this handoff, and add an entry to `docs/governance/DEFERRED_WORK.md` proposing the deletion for Shayan's approval (matching the existing style of the `cloud/roles/*` dead-code entries already in that file — look at those for the exact tone/format). Do the same for `taskbusApi` in `lib/api.js` (comment + defer, don't delete).
4. Separately, and this part you CAN do directly (it's not a deletion, it's closing a real gap): cap `cloud/orchestrator/graphExpander.js`'s `expandGraph()` function (currently completely uncapped — confirmed today, no `MAX_NODES`/depth constant or `state.nodes.length` check anywhere in the 58-line file) so a graph can't grow unboundedly. Add a constant (e.g. `MAX_GRAPH_NODES = 200` — pick a number that's generously above any realistic legitimate workflow size you can find evidence of in `cloud/graphs/*.js`'s existing graph definitions, and say what you chose and why) and have `expandGraph` return early / refuse to add more nodes once `snapshot.nodes.length` (or however the current node count is tracked — read the function first) reaches that cap. Add a test (`cloud/orchestrator/graphExpander.test.js` — new file, add it to `package.json`'s `"test"` script) proving a graph stops growing at the cap instead of unboundedly.

---

## Task Group E — Two small, independent, verified-broken fixes

Neither depends on the other or on any task above; do them in either order.

1. **`cloud/taskbus/persistence.js`**, line 54: `is_real_ai: result.is_real_ai_result,` — the actual Supabase column (per `migrations/001_base_tables.sql`) is `is_real_ai_result`, not `is_real_ai`. Postgrest silently rejects the unknown field and the error is swallowed elsewhere in the same function (read the surrounding function to find exactly where — it's a `.catch()` or similar that discards the error, confirm and quote it in your report). Fix: change the key to `is_real_ai_result: result.is_real_ai_result,`. This field has likely never actually synced to Supabase since this code was written — say so plainly in your report, don't undersell it as a typo fix.
2. **`cloud/api/phoneRoutes.js`**'s Twilio webhook signature check (`requireTwilioWebhookSignature`, currently defined around line 51, used on `POST /webhook/sms` and `POST /webhook/voice`) is functionally broken: no `express.urlencoded()` middleware exists anywhere in `cloud/server.js` (confirmed via grep today), and Twilio posts webhooks as `application/x-www-form-urlencoded` — so `req.body` is empty by the time `twilioSdk.validateRequest(authToken, signature, url, req.body || {})` runs, meaning a genuine, correctly-signed Twilio request will fail verification (fails closed — not exploitable, but inbound SMS/call handling doesn't work in production today). Fix: add `express.urlencoded({ extended: false })` scoped specifically to the two webhook routes in `cloud/api/phoneRoutes.js` (mirror how `cloud/api/billingRoutes.js` scopes `express.raw()` to just its `/webhook` route rather than applying globally — read that file for the pattern, it solves an analogous problem for Stripe). Do not add a global `express.urlencoded()` in `cloud/server.js` — that's broader than this fix needs and could have side effects on other routes you haven't audited.
3. Add or extend a test proving each fix: for #1, a test asserting the upsert payload sent to the (mocked) Supabase client uses the key `is_real_ai_result`; for #2, extend `cloud/api/phoneRoutes.test.js` with a case that POSTs a form-urlencoded body with a valid Twilio signature and asserts it's now accepted (you'll need to generate a real signature the way Twilio's own SDK would — check if `twilio` package exposes a test-signature helper the same way `stripe`'s SDK does, used elsewhere in this repo's tests; if it doesn't, construct the HMAC-SHA1 signature manually per Twilio's documented algorithm using a fixture auth token, and say clearly in your report that you did so).

---

## 3. What you are explicitly NOT doing in this handoff

- Not touching `.env`, real secrets, or any dashboard (Railway/Stripe/Supabase/Sentry/GitHub repo settings) — no access, none needed.
- Not rotating any keys, not touching the historical `.env`-in-git-history issue on `Thatisshayan-patch-1` (audit doc §3 item 1) — that needs Shayan's direct decision (rotate keys, then rewrite/delete the branch), not code.
- Not checking or fixing anything Railway-deployment-related (the reported production outage in the audit doc §0, or the `VITE_TASKBUS_API_KEY` possible-leak item in §2.3) — both need Railway dashboard access this handoff assumes you don't have.
- Not deleting `useProviders.js` or `taskbusApi` (R14 — see Task D, propose only).
- Not rewriting `REPO_RULES.md`/`BRANCH_POLICY.md`'s stale "main" references — out of scope, flagged for a future doc-consistency pass (§6).
- Not touching `desktop/` or code-signing.
- Not attempting `cloud/orchestrator/graphRunner.js`'s retry-loop-without-DLQ issue (audit doc §5 item 2) — **new finding from today's verification pass: this file is dead code, confirmed via repo-wide grep, nothing requires it.** Don't spend effort "fixing" a file nothing runs. Add a `DEFERRED_WORK.md` entry noting it's confirmed dead and asking Shayan whether to delete (R14) or repurpose it — that's the correct scope for this file right now, not a functional fix.
- Not persisting the in-memory audit trail (`cloud/utils/auditLog.js`) to the existing-but-unused `acc_audit_log` Supabase table (audit doc §5 item 3) — this is real and worth doing, but it's a bigger schema-integration task better scoped as its own handoff once the migration-ordering fix in Task A has actually been verified against a live Supabase project (which needs Shayan). Recorded in `DEFERRED_WORK.md`, not assigned here.

If you find something else broken while working in this code (R11), don't silently fix it outside scope — record it in `docs/governance/DEFERRED_WORK.md` with today's date and mention it in your final report.

---

## 4. Verification checklist before opening the PR

- [ ] `npm test` passes, full output pasted in your report, including any new test files from Tasks D and E.
- [ ] Migration fix (Task A): the repo-wide `ALTER TABLE acc_waitlist` grep result pasted, confirming no other migration breaks.
- [ ] Mobile auth (Task B): `npx tsc --noEmit` (or equivalent) run in `mobile/` with no new errors; explicit statement of what was and wasn't manually verified (no automated mobile test infra exists to extend).
- [ ] CI fixes (Task C): `gh pr checks` output from your own PR, pasted, showing `gate` actually triggered.
- [ ] Frontend cleanup (Task D): `useProviders.js`/`taskbusApi` NOT deleted, only commented + deferred in `DEFERRED_WORK.md`; `graphExpander.js` cap has a passing test.
- [ ] Task E: both fixes have a passing test proving the specific broken behavior is now correct.
- [ ] `docs/governance/DEFERRED_WORK.md` has new entries for: the proposed `useProviders.js`/`taskbusApi` deletion, the confirmed-dead `orchestrator/graphRunner.js`, and anything else you found but didn't fix.
- [ ] No secrets, tokens, or credentials anywhere in your diff.
- [ ] Branch is `agent/opencode-<short-slug>`, based on current `master`.
- [ ] Commits use `type(scope): summary` format, one or more per task group.
- [ ] PR description lists which `REPO_RULES.md` rules this satisfies and pastes verification evidence (R28, R38).
- [ ] PR is opened against `master`, **left open, not merged.**

---

## 5. Reporting back

When done (or if you get blocked), your final message must state clearly, per task group (A–E):
- `done` / `partial` / `blocked`, with reason if not `done`.
- The actual command output you ran to verify it (not a paraphrase).
- Anything you deviated from in this handoff and why.
- The PR URL.

Do not say "all tests pass" without showing the `npm test` output. Do not say a task is complete if you only wrote the code but didn't run it and observe the result yourself.
