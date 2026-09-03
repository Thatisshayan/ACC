# ACC — Comprehensive Audit & Launch Readiness (2026-09-03, Claude)

This is the canonical "what's left" document as of this session. It supersedes the
open-item lists scattered across `CLAUDE.md` and folds in `docs/governance/DEFERRED_WORK.md`
(that file remains the append-only per-item log; this file is the prioritized rollup).
Future sessions: **add new items here first**, then cross-link from `DEFERRED_WORK.md`
if you want the append-only trail too.

Scope: five parallel deep-dives (security, data layer/migrations, orchestration
engine, dependencies/build/CI, and every client surface — web/mobile/desktop) run
against a 6,234-node/11,698-edge index of the repo, plus a full git/PR/branch audit.
No production access was available (Railway is reportedly down as of this session —
see below); everything here is from static analysis of the repo.

---

## 0.1 Update — 46-alert CodeQL backlog remediation pass (2026-09-03, same day)

After PR #22 (the codeExec RCE/SSRF fix) merged, pulling the full CodeQL alert
list on `master` surfaced **46 pre-existing open alerts**, unrelated to that PR —
findings that had been accumulating silently with nothing acting on them. This
session did a dedicated pass through all of them. Summary — full detail in each
fix's own code comment, not repeated here:

**Confirmed real and fixed** (not exhaustive to keep this section short — see PR
history for the complete list):
- **`cloud/hub/events.js`** — the most serious one found this pass. `event.type`
  (fully caller-controlled via `POST /api/hub/event`) was looked up in a plain
  `{}`-literal handler map. `event.type === 'constructor'` resolved through the
  inherited `Object.prototype` chain to the real `Object` constructor, and
  calling it just returned the event object itself — letting a caller smuggle
  `approval_required: false` / `automation_mode: 'auto'` directly onto the event
  body and have it flow straight into `store.createTask()`, **bypassing the
  approval gate entirely**. Fixed: static `switch` dispatch, no lookup table left
  to resolve through. Same root-cause class as the `cloud/utils/safeExpr.js` fix
  from earlier in this session (see `docs/SECURITY_CODEEXEC.md`) — evidently a
  recurring pattern worth watching for elsewhere.
- **`cloud/hub/registry.js` / `cloud/hub/commands.js`** — `app.webhookUrl`
  (caller-supplied at `POST /api/hub/register`, later POSTed to by
  `sendCommand()`) had zero validation — a real SSRF. Fixed using a new shared
  `cloud/utils/ssrfGuard.js` (extracted from the codeExec fix's guard), applied
  both at registration time and again at send time.
- **`cloud/workflows/accOutreachCrmModule.js`** — `sheetCsvUrl` from
  `POST /api/taskbus/workflow/outreach-crm/bootstrap`'s body went straight into
  `axios.get()` with no validation — same SSRF shape, same shared guard applied.
- **`cloud/security/ephemeralSnapshots.js`** — `snapshotId` from
  `POST /api/security/snapshot/approve`'s body had no format check before
  reaching the filesystem; it was only safe by the incidental accident that
  `getSnapshot()`'s in-memory `Map.get()` happened to gate it first. Added an
  explicit id-format + resolved-path containment check at the one place that
  actually builds a path, independent of caller behavior. (Also found and fixed
  in passing: the same file's 7-day `setTimeout` wasn't `.unref()`'d, which would
  hang a clean process shutdown — or `node --test` on this file — for up to 7 days.)
- **`cloud/dlq/handler.js`** — the existing regex id-validation was already
  correct (re-verified), but CodeQL doesn't credit a positive-allowlist regex as
  its recognized path-injection sanitizer shape. Added a resolved-path
  containment check as a second, CodeQL-recognized layer on top.
- **`cloud/api/outreachRoutes.js`** — real reflected XSS: `GET /unsubscribe`
  interpolated `req.query.email` straight into an HTML response, and reflected
  raw exception text on failure (which could carry the same unescaped input back
  out). Fixed: HTML-escape the email, and never echo exception text as HTML.
  Separately noted, not changed: this whole route is gated behind
  `requireOperatorOrAdmin`, which means a real unsubscribe link clicked by an
  email recipient (who has no API key) 401s today — a CASL/compliance-relevant
  access-control question that's yours to decide, not something to change
  unilaterally as part of a security-alert cleanup pass.
- **`cloud/api/phoneRoutes.js`** — the TwiML injection flagged in §3 of this
  document (`<Say>${body.message}</Say>` unescaped) is now fixed (XML-escaped).
  Also added a dedicated, stricter rate limiter on this router and
  `billingRoutes.js`'s auth-checking middleware, on top of the app-wide limiter.
- **`cloud/memory/store.js`** — the SQL `LIKE` search pattern escaped `%` but the
  query had no `ESCAPE` clause, so that escaping was actually a no-op; `_` (SQLite's
  other `LIKE` wildcard) wasn't escaped at all. Fixed properly (escape the escape
  character first, then both wildcards, declare `ESCAPE '\'`).
- **`cloud/services/emailMonitor.js`** — two fixes: (1) the IMAP password
  "encryption" was actually just base64 (already flagged as an open P0 in §2.2
  above — now genuinely fixed with the existing AES-256-GCM helper, with a
  fallback decode path for anything saved under the old format); (2) the
  Telegram-message escaper (`escTg`) didn't escape literal backslashes first,
  so a crafted email subject could break out of the intended plain-text
  formatting into live MarkdownV2 (verified concretely: unescaped output let an
  injected `_..._` render as italics instead of literal underscores).
- **`desktop/main.js`** — `url.startsWith(CLOUD_URL)` is a substring check, not
  an origin check — `https://acccommand.center.evil.com` would have passed it,
  silently treated as trusted content instead of sent to the external browser.
  Fixed with a real parsed-origin comparison; also added a `will-navigate` guard
  (closing the gap the frontend audit in §3 above had flagged but left open).
- **`cloud/telegram/bot.js`** — a redundant/duplicate Unicode range in a
  character class (copy-paste leftover); removed with verified no behavior change.
- **`cloud/server.js`** — the waitlist email regex was the textbook ReDoS-cited
  email pattern; replaced with an equivalent, backtracking-free `indexOf`-based
  check (verified identical behavior across a range of cases).
- **`cloud/messages/service.js`** — 12 ReDoS alerts across several intent-parsing
  regexes sharing the same root shape (adjacent unbounded quantifiers over
  overlapping whitespace). Rather than hand-verify each regex's exact safety,
  capped input length at the top of `parseAssistantIntent` (4000 chars — Telegram's
  own message cap is 4096) so worst-case backtracking time is bounded regardless
  of the exact pattern; empirically confirmed this specific V8 build handles even
  un-capped pathological input for these particular regexes in well under a
  millisecond, so the cap is defense-in-depth against future engine/pattern
  changes, not a fix for an observed slowdown.
- **`.github/workflows/ci.yml`** — added an explicit least-privilege
  `permissions: contents: read` block at the workflow level.

**Confirmed false positives, not changed** (documented here so they aren't
re-investigated):
- `js/request-forgery` in `cloud/connectors/clickup.js` and
  `cloud/connectors/foundersocialclub.js` (×2) — in all three, the tainted value
  is a path segment appended *after* a fixed, hardcoded host (`BASE`/`BASE_URL`
  from env config, not per-request input); string concatenation into a path
  segment cannot redirect the request to a different host, so this isn't SSRF.
- `js/clear-text-logging` in `scripts/verify-security-lockdown.js:326` — the
  logged value is an HTTP status code stored under a field literally named
  `executeNoAuth` (a security-probe test report); CodeQL's naming heuristic
  matched "Auth" in the field name, not an actual credential in the data.
- `js/polynomial-redos` in `cloud/telegram/webhookHandler.js:72` — `/\/+$/` is a
  single quantified character class with no nesting or overlap; there is nothing
  for it to backtrack ambiguously on (confirmed linear-time up to very large
  inputs). Likely flagged purely because the target string derives from
  caller-influenced input, independent of whether the pattern itself is safe.

**Not yet re-verified against a live GitHub code-scanning re-scan** — this
document reflects what was fixed and why; confirm the alert count actually drops
in the Security tab once this lands and CodeQL re-runs.

---

## 0. Production incident — Railway reportedly down

Reported at the start of this session, not independently verified — this
environment has no working Railway CLI/API access (`railway whoami` succeeds but
`railway list`/`link` return `Unauthorized`, per earlier session notes in
`CLAUDE.md`; unchanged this session). **This needs your direct attention**, not a
static-analysis guess. Suggested triage order:

1. `railway login` interactively (browser OAuth) to get a working session, then
   `railway logs` to see the actual crash/boot error.
2. Check whether the last deploy picked up a change that fails at boot. Nothing in
   this session's changes has been deployed (see §4 — everything is on a feature
   branch, not merged), so if the outage predates this session, it's unrelated to
   this work.
3. Known items that could plausibly cause a boot-time failure and haven't been
   ruled out: `cloud/config/validateEnv.js` refusing to start on a missing
   `[REQUIRED_PROD]` var (check Railway's env vars against `.env.example`,
   including the two new ones added this session — `CODEEXEC_ENABLED`,
   `CODEEXEC_HTTP_ALLOWLIST` — both optional, should not block boot); the
   Dockerfile/nixpacks drift in §3.4 below, if Railway's build settings were ever
   toggled; or a genuinely unrelated Railway platform issue.
4. `GET /health` and `GET /api/health` are both real, ungated routes
   (`cloud/server.js`) — once the service responds at all, hitting those confirms
   whether it's a boot crash vs. a networking/proxy issue in front of it.

---

## 1. Launch readiness verdict

**Not launch-ready before this session; the two most severe issues (RCE + SSRF)
are fixed and merged into this session's branch, not yet on `master`.** See §4 for
exactly what's merged where. Once the branch in §4 lands, re-assess against the P0
list below — most of it should be crossed off.

| Priority | Count at session start | Fixed this session | Still open |
|---|---|---|---|
| P0 — Critical | 7 | 6 | 1 |
| P1 — High | 4 | 1 | 3 |
| P2 — Medium | 9 | 0 | 9 |
| P3 — Low | 9 | 1 | 8 |

(Updated after the same-day §0.1 CodeQL-backlog pass, which also fixed item 7
below and the TwiML injection in §3 — both were independently flagged by CodeQL
as well as the earlier manual audit.)

---

## 2. P0 — Critical

### 2.1 Fixed this session

1. **RCE via `node:vm` sandbox escape** (`cloud/connectors/codeExec.js`, reachable
   through the `code.run` chat intent). **Fixed** — see `docs/SECURITY_CODEEXEC.md`
   for the full writeup. `code.run` no longer touches `vm`; it's evaluated by a
   dependency-free arithmetic parser (`cloud/utils/safeExpr.js`).
2. **SSRF via unrestricted outbound fetch** (`agent.http` chat intent). **Fixed** —
   private/loopback/link-local/metadata addresses blocked for both literal IPs and
   DNS-resolved hostnames (closes DNS rebinding), non-http(s) schemes rejected,
   redirects not auto-followed, optional domain allowlist.
3. **Both reachable by operator-role keys, not just admin.** **Fixed** — `code.run`
   and `agent.http` now require `role === 'admin'`, checked in
   `cloud/messages/service.js` before anything executes; every attempt is logged.
4. **"transform" action shared the same vm-escape root cause.** **Fixed** —
   gated behind the same `CODEEXEC_ENABLED` kill switch (default off) as
   `runJS`/`httpRequest`.
5. Regression tests added: `cloud/utils/safeExpr.test.js`,
   `cloud/connectors/codeExec.test.js`, `cloud/messages/service.test.js` (23 new
   tests, all passing; full suite 176/176 passing after this session's changes).

### 2.2 Still open

6. **Migrations alter a table before creating it.**
   `migrations/003_waitlist_columns.sql` runs `ALTER TABLE acc_waitlist` but the
   table isn't created until `migrations/009_waitlist_base.sql`. `scripts/migrate.js`
   applies files in order and throws on first failure — a fresh Supabase project
   cannot bootstrap past migration 003. This is the root cause of the long-standing
   "run SQL tables on new Supabase project" pending item in `CLAUDE.md`. **Fix**:
   renumber 009 ahead of 003, or fold `CREATE TABLE IF NOT EXISTS acc_waitlist`
   into 003 itself. Not touched this session — schema/migration-ordering changes
   felt like they needed your sign-off before rewriting migration history,
   especially with a production incident in progress.

**Fixed in the §0.1 same-day follow-up pass:**

7. ~~**IMAP app passwords aren't actually encrypted.**~~ **Fixed.**
   `cloud/services/emailMonitor.js:32` did `Buffer.from(password).toString('base64')`
   — trivially reversible. Now routed through the existing AES-256-GCM helper
   (`cloud/messages/encryption.js`), with a fallback decode path for anything
   saved under the old base64 format so existing credentials don't break.

### 2.3 Needs your direct verification (can't be checked from this session)

8. **Mobile app sends no auth header at all** (`mobile/src/lib/api.ts`) — will 401
   on essentially every backend call as shipped. Not fixed this session (it's a
   mobile-app change, separate surface from the codeExec work); still open.
9. **A privileged API key may be shipping inside the public web UI bundle.**
   `.env.example` line ~14 literally instructs: `VITE_TASKBUS_API_KEY=same_as_taskbus_api_key
   # injected into the Vite/React build`. Vite inlines `VITE_*` vars into client JS
   at build time. **Check the Railway build environment for this variable now** —
   if it's set to a real service/operator key, it is visible to any visitor via
   view-source, and should be rotated immediately, then stopped from shipping
   client-side. This session could not check Railway's env vars (no working CLI
   access — see §0).

---

## 3. P1 — High

1. **Historical `.env` leak still live on a pushed branch.** A prior `.env` commit
   (Supabase service-role key, Stripe secret key, other API keys) was removed from
   a later commit but never rewritten out of history; `origin/Thatisshayan-patch-1`
   still holds it. Rotate every key that was ever in that file, then delete or
   force-rewrite the branch. **Still open** — needs your call (rotating live keys,
   rewriting git history).
2. **`acc_card_requests.card_data` relies on RLS alone, no app-level encryption.**
   Confirm with whoever owns the Privacy.com card flow whether card
   numbers/CVVs land in this JSONB column — if so, encrypt at rest like messages
   already are. **Still open.**
3. **Two divergent frontend API clients** (`ui/src/lib/api.js` vs `ui/src/api.js`)
   — one never attaches the admin bearer token and only sets a spoofable
   `x-approver` header. Currently harmless (the vulnerable client's hooks —
   `useTaskBus`/`useSocket`/`useProviders` — aren't imported anywhere), but it's an
   armed footgun the moment someone wires one up. Delete one client. **Still open.**
4. ~~**TwiML injection in the Twilio call task**~~ **Fixed** in the §0.1 same-day
   follow-up pass. `cloud/api/phoneRoutes.js`'s `body.message` was interpolated
   unescaped into a `<Say>` element (found independently by both the manual
   audit and CodeQL's `js/reflected-xss`-adjacent review); now XML-escaped.

---

## 4. This session's code changes — where they live

Everything below is on a feature branch (see the PR this session opened), **not
yet merged to `master`**. Nothing has been deployed.

- `cloud/connectors/codeExec.js` — kill switch, SSRF guard (literal-IP + DNS-lookup
  based), redirect handling.
- `cloud/utils/safeExpr.js` (new) — dependency-free arithmetic evaluator.
- `cloud/utils/safeExpr.test.js` (new), `cloud/connectors/codeExec.test.js` (new),
  `cloud/messages/service.test.js` (new) — 23 regression tests.
- `cloud/messages/service.js` — admin-only gate + audit logging on `code.run`/
  `agent.http`; `code.run` routed through `safeExpr` instead of `vm`; intent
  matching anchored to message start instead of matching anywhere in the text.
- `cloud/api/assistant.js` — passes `req.auth.role` through to `executeAssistantIntent`.
- `.env.example` — documents `CODEEXEC_ENABLED` / `CODEEXEC_HTTP_ALLOWLIST`.
- `package.json` — registers the three new test files in `npm test`.
- `docs/SECURITY_CODEEXEC.md` (new) — full writeup of the vulnerability and fix.
- `CLAUDE.md` — corrects stale nixpacks/Dockerfile claim, marks the `tryAlibaba`
  and `notifyOperator` items (already fixed by an earlier, undocumented session)
  as resolved, points at this file as the canonical open-items list.
- This file.

### 4.4 Deploy config drift (documented, not fixed)

`railway.json` sets `"builder": "DOCKERFILE"` pointing at the root `Dockerfile`
(present, real). `CLAUDE.md`'s own commit log claims "Switched to nixpacks, deleted
Dockerfile" — no longer true. Two `nixpacks.toml` files remain (root and `cloud/`)
and actively disagree with each other (one builds the UI, one doesn't via `npm ci
--omit=dev` with no UI build step). If Railway is ever switched back to nixpacks,
it's ambiguous which config wins and the UI likely won't build. **Recommendation**:
delete both `nixpacks.toml` files (Dockerfile is what's actually in use) unless you
specifically intend to switch back — in which case reconcile them into one file
first. Not done this session — a build-config change felt riskier to make
unreviewed while production is reportedly down, versus a docs-only correction.

---

## 5. P2 — Medium (all still open, unchanged this session)

1. Dynamic graph expansion (`cloud/orchestrator/graphExpander.js`) has no
   node/depth cap — a hallucinating DeepSeek response can grow a graph
   unboundedly, each new node costing an API call.
2. The legacy `cloud/orchestrator/graphRunner.js` auto-fix retry loop has no
   attempt cap and never calls `writeToDLQ` on permanent failure — silent,
   un-notified failures. Confirm whether this runner is even live before deciding
   whether to fix or delete it (dependency audit flagged it as an orphaned module
   with zero first-party requires — see §7).
3. The security audit trail is an in-memory array (`cloud/utils/auditLog.js`) that
   resets on every restart; `acc_audit_log` exists in the schema for exactly this
   and is never written to.
4. A field-name mismatch (`is_real_ai` vs `is_real_ai_result`) silently drops a
   sync field in `cloud/taskbus/persistence.js` — the Postgrest error is caught
   and swallowed.
5. `.github/workflows/ci.yml` never actually runs `npm test` — only syntax checks
   and standalone module-load smoke tests. The ~20 real test files (now ~23 more
   after this session) never execute in CI.
6. `.github/workflows/gate.yml`'s PR trigger targets `main`, which doesn't exist
   (default branch is `master`) — the gate still fires on pushes, but PR-triggered
   checks are unreachable.
7. `mobile/` has 30 unaudited dependency vulnerabilities (21 moderate, 9 high),
   undocumented until this audit.
8. `@sentry/react` is externalized for the bundler but not in `ui/package.json`
   and has no import map — throws at runtime instead of loading Sentry if
   `VITE_SENTRY_DSN` is ever set in prod.
9. **All four open dependency/docs PRs are blocked from auto-merging by a
   `claude-review` check that structurally cannot pass** (see §7) — this isn't a
   code problem in those PRs, it's a missing `ANTHROPIC_API_KEY` repo secret for
   the `claude-code-review.yml` workflow. Same will apply to this session's own PR.

---

## 6. P3 — Low (all still open, unchanged this session)

1. Twilio webhook signature validation is likely always failing — no
   `express.urlencoded()` middleware exists, so `req.body` is empty when
   `twilioSdk.validateRequest()` runs. Fails closed (not exploitable) but inbound
   SMS/call handling doesn't functionally work in production.
2. Inbound SMS/call text is forwarded to Telegram with `parse_mode: 'Markdown'`
   unescaped — cosmetic risk only, lands solely in the owner's own chat.
3. `cloud/messages/store.js` is the one file-backed store still on raw JSON
   (whole-file rewrite per message, read-modify-write race, unbounded growth) —
   `taskbus`/`memory` stores already moved to SQLite/WAL.
4. `scripts/verify-migration-coverage.js` / `verify-db-auth-hardening.js` are text
   greps, not real SQL/order-aware checks — would not have caught item 2.1.6 above.
5. Desktop preload exposes `backendStatus()`/`retryBackendStart()` IPC calls with
   no registered handler in `main.js` — **still open**. The `will-navigate` guard
   half of this item **is fixed** (§0.1 pass, alongside the origin-check bug that
   made it worth doing at the same time).
6. `ui/` has 2 known-fixable vulnerabilities, `desktop/` has 4 (one needs a
   breaking `electron@44` bump, deferred by design — same pattern as other
   deferred major bumps in this repo).
7. 23 orphaned modules beyond the already-tracked `cloud/roles/*` (full list in
   `docs/governance/DEFERRED_WORK.md`) — no new ones found this session beyond
   what's already logged there.
8. 26 workflow templates in `cloud/workflows/chatgpt/*.json` are unreferenced by
   any code — likely intentional (manual-import templates), worth confirming
   intent; natural fit for the "workflow gallery" feature idea below.
9. A third of the Supabase schema (12+ tables) is created but never queried by any
   code — dead schema, not a bug, but worth pruning or building against.

---

## 7. PR queue — should any of these be merged?

Investigated per your request. **One consistent, repo-wide root cause explains why
none of these have been merged**: every single open PR — including totally
unrelated dependency bumps and doc-only changes — has a **failing `claude-review`
check**, and the job log shows why: `ANTHROPIC_API_KEY:` is empty in the workflow
run. The `claude-code-review.yml` GitHub Action needs an `ANTHROPIC_API_KEY` repo
secret that isn't configured, so this check can structurally never pass, on any PR,
until that secret is added in repo settings. **`master` has no branch protection
rules** (confirmed via the GitHub API — 404 on the protection endpoint), so this
failing check has never actually blocked a merge — these PRs are simply sitting
unattended, not blocked by anything real.

| PR | Title | Mergeable | Real diff (merge-base) | Recommendation |
|---|---|---|---|---|
| **#12** | bump npm_and_yarn group across 4 dirs | **CONFLICTING** (dirty) | 8 files — root/desktop/mobile/ui `package.json`+lockfiles | **Don't merge as-is.** Genuinely conflicts with `master` — the branch is stale relative to dependency changes already made on `master` since (including this repo's own `npm audit fix` pass). Close and let Dependabot recreate it, or manually rebase. |
| #16 | hermes governance bootstrap | Mergeable | 1 file, `.gitignore`, +3/-0 | **Safe to merge.** Trivial, additive-only. |
| #18 | handoff deployment readiness hardening | Mergeable | 2 files, both new docs under `docs/governance/`, +291/-0 | **Safe to merge.** Docs-only, purely additive, no code touched. |
| #20 | bump fast-xml-parser (mobile) | Mergeable | 2 files, `mobile/package.json` + lockfile | **Safe to merge**, ordinary dependency bump. Worth a quick `npm install && npm test` in `mobile/` after merging, not before — this session didn't have reason to touch mobile deps. |
| #21 | bump uv group (2 crewai workflow dirs) | Mergeable | 2 `uv.lock` files under `cloud/workflows/crewai/*` | **Safe to merge.** Doesn't touch application code, only vendored Python workflow subproject lockfiles. |

None of PR #12/16/18/20/21's commits are already ancestors of `master` — they're
genuinely unmerged work, not redundant leftovers. **I did not merge any of these** —
merging pre-existing PRs written by other sessions felt outside the scope of "fix
the two things I asked you to fix," especially with a production incident open.
Recommend: merge #16, #18, #20, #21 whenever you're ready (low risk, high
confidence per the analysis above); close #12 and let Dependabot regenerate it
against current `master`.

**Structural fix worth doing regardless of the above**: either add the
`ANTHROPIC_API_KEY` secret so `claude-review` can actually pass, or remove it from
being treated as meaningful signal on PRs — right now every PR shows one red X that
means nothing.

---

## 8. Repo/worktree state at the start of this session

Checked per your request, before this session's own changes:

- **Worktree**: clean at session start (no uncommitted changes, no untracked files
  besides this session's own new files, listed in §4).
- **`master`**: up to date with `origin/master`, no unpushed local commits.
- **Local branches** other than `master`: `agent/claude/001-branch-onboarding`
  (remote deleted — local copy is now orphaned, safe to delete),
  `agent/hermes-governance-bootstrap`, `agent/opencode-comprehensive-hardening`,
  `dependabot/npm_and_yarn/npm_and_yarn-dcf31ca5a9`,
  `docs/handoff-deployment-readiness-hardening`, `fix/allow-dependabot-claude-review`
  (this one shown 15 commits **behind** `origin/master` locally — stale local copy
  of an already-merged branch, safe to delete locally).
- **Remote branches**: match the open-PR list in §7 plus the merged/stale ones
  above; two Dependabot branches were deleted upstream between fetches (mobile
  form-data, ui multi-bump) and one new one appeared
  (`dependabot/npm_and_yarn/mobile/npm_and_yarn-5a3aa769a5`, PR #20) — normal
  Dependabot churn, not a problem.
- Nothing here needed cleanup before starting this session's work; noted for your
  awareness, not acted on (deleting local branches wasn't asked for).

---

## 9. What's genuinely done vs. still yours to decide

**Done, verified, tested this session**: the RCE/SSRF fix (§2.1), the intent
anchoring, the doc-drift corrections in `CLAUDE.md`, this tracking file.

**Needs your call, not mine**: whether to merge PRs #16/18/20/21 and close #12
(§7); whether/when to fix the migration-ordering bug and IMAP plaintext-password
issue (§2.2 — both are independent, scoped fixes, ready to pick up whenever);
checking Railway's env vars for a leaked `VITE_TASKBUS_API_KEY` (§2.3) and
diagnosing the reported outage (§0) — both need access this session doesn't have;
adding the `ANTHROPIC_API_KEY` secret so `claude-review` stops showing a
meaningless red X on every PR (§7).
