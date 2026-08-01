# Handoff: Reliability & Security Hardening Pass

Date: 2026-08-01
From: Claude (Sonnet 5), session on `agent/hermes-governance-bootstrap`
To: opencode agent (DeepSeek V4 Flash)
Status: **Ready to start.** Not yet started by any agent.
Governance: This repo is governed by `REPO_RULES.md`. This handoff has been written to comply with it — read that file before you start if anything here is ambiguous. Where this doc and `REPO_RULES.md` conflict, `REPO_RULES.md` wins.

---

## 0. Why this handoff exists, and why it is NOT a baby-step list

Over several previous sessions, a line-by-line audit of `cloud/*` found and fixed a cluster of real, live bugs (missing deps causing silent 500s, a broken Stripe webhook, unauthenticated sensitive routes, timing-unsafe auth comparisons, a WebSocket server that returned the wrong shape on reconnect, a path-traversal hole in DLQ admin routes). All of those **production fixes landed with zero regression tests.** That means every one of them can silently regress the next time someone touches that code, and nobody will find out until it breaks in production again.

This handoff is not "add a few unit tests." It is: **close the regression-test gap on every live-fixed security/reliability bug, retire the dead code that could be mistaken for the real thing, and wire up the one approval path that's currently a no-op stub** — as one coherent, verifiable, mergeable body of work. Every task below has a concrete acceptance test. Do not stop at "code looks right" — prove it with `npm test` output.

**Definition of "worth it" for this handoff:** when you're done, `npm test` covers every bug listed in Task Group A, the dead-code trap in Task Group B is neutralized without deleting anything (see R14 below), the approval-notification gap in Task Group C is closed end-to-end with a real Telegram message, and the whole thing is sitting on one branch as a clean, reviewable PR against `master`. That is the bar. Partial credit ("I added one test file") is not the bar.

---

## 1. Ground rules (non-negotiable — from REPO_RULES.md)

1. **Never touch `.env`, secrets, or credentials.** No reading, printing, committing, or inventing values for `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_API_KEY`, `TELEGRAM_BOT_TOKEN`, etc. Tests must use fixture/fake values (existing test files in this repo already do this — follow their pattern).
2. **No file deletion without Shayan's direct approval (R14).** This includes `cloud/roles/*`, which Task Group B covers — you will **neutralize, not delete** it. See Task Group B for the exact mechanism.
3. **Never commit to `master` directly.** Work on a new branch: `agent/deepseek-reliability-hardening` (matches R27's `agent/<AgentName>-<short-slug>` pattern).
4. **Commit in coherent increments** (R9) — one commit per task group is reasonable, don't squash everything into one giant commit, don't commit one line at a time either.
5. **Conventional commits** (R28): `type(scope): summary`, e.g. `test(ws): add regression coverage for startWSServer reconnect shape`.
6. **No paid API calls or spend** (R24). Everything in this handoff is local code + local tests. If a task seems to require hitting a real Stripe/Telegram/Supabase endpoint, you're overscoping — stop and use a mock/fixture instead.
7. **Do not silently skip a task** (R4). If something in this doc turns out to be wrong (a file moved, a function was renamed), say so explicitly in your completion report rather than quietly working around it or skipping it.
8. **Open a PR when done. Do not merge it.** Target branch: `master`. The user (Shayan, via a follow-up Claude session) will review and control the merge. Leave the PR open and say so clearly when you report back.
9. Run `npm test` after every task group and paste the actual output in your final report — not a summary, the actual pass/fail lines (R38, evidence required).

---

## 2. Repo orientation (facts, verified 2026-08-01 — trust these, don't re-derive)

- Package manager: **npm** (not pnpm/yarn). `package-lock.json` is the committed lockfile.
- Test runner: Node's built-in `node --test`, invoked via `npm test`, which currently runs:
  ```
  node cloud/taskbus/router.test.js && node --test cloud/security/webhookHmac.test.js cloud/taskbus/store.test.js cloud/messages/store.test.js cloud/middleware/auth.test.js cloud/memory/store.test.js cloud/utils/logger.test.js
  ```
  New test files you add must be appended to this list in `package.json`'s `"test"` script, or `npm test` will never run them.
- Existing test file `cloud/middleware/auth.test.js` is a good style reference: uses `node:test` + `node:assert/strict`, fakes `req`/`res`, sets/deletes `process.env.*` per test.
- CI gate: `.github/workflows/gate.yml` runs `scripts/verify.sh`, which enforces secret-scan, doc-freshness, build, test, deploy-dry (R30). Your branch should pass all of these before you call it done.

---

## Task Group A — Regression tests for the 3 live-fixed bugs (highest priority)

These three bugs were fixed in production code already. **Do not change the fix logic unless you find it's actually still broken** — your job is to prove it's fixed and keep it that way.

### A1. WebSocket server double-start shape bug
- File under test: `cloud/ws/server.js`
- The bug (already fixed): `startWSServer(httpServer)` used to return the bare `wss` object on the "already started" guard path instead of `{ wss, broadcast }`, so a second caller destructuring `.broadcast` got `undefined`.
- Current (correct) code: `if (wss) return { wss, broadcast };` at line 15.
- **Write `cloud/ws/server.test.js`:**
  - Test that calling `startWSServer(fakeHttpServer)` twice returns an object with a `.broadcast` function both times.
  - Test that the `broadcast` returned on the second call is the same usable function (not `undefined`, not a different reference that breaks behavior).
  - You'll need a minimal fake `httpServer` — check what `startWSServer` actually does with its argument before assuming you need a real HTTP server; a stub object may be sufficient. If it truly needs a real server, use Node's `http.createServer()` in the test and close it in a cleanup step.
- Acceptance: test fails if someone reverts line 15 back to `return wss;`. Verify this by temporarily reverting it locally, confirming the test fails, then restoring the fix — mention in your report that you did this verification step.

### A2. DLQ path traversal
- Files under test: `cloud/dlq/handler.js` (has `VALID_ID_RE = /^dlq_[0-9]+_[a-zA-Z0-9_]+$/` and a validation function around line 17-19), `cloud/admin/dlqRoutes.js` (the routes that consume `req.params.id`).
- The bug (already fixed): DLQ id strings from `req.params.id` were used directly to build filesystem paths with no validation, allowing `../../etc/passwd`-style traversal.
- **Write `cloud/dlq/handler.test.js`:**
  - Test the id-validation function directly (find its actual exported name in `cloud/dlq/handler.js` — read the file, don't guess) with: a valid id (`dlq_1234567890_some_node`), and several malicious ids (`../../../etc/passwd`, `dlq_123_../../secret`, `dlq_123_<script>`, empty string, non-string input). Valid → accepted/non-null. Malicious → rejected/null.
  - If `getDLQItem`/`markRequeued`/`deleteDLQItem` are exported and testable without real filesystem side effects (or with a temp directory fixture), add a test that a traversal-shaped id is rejected before any filesystem access happens — not just that the regex matches, but that the actual handler function refuses to act on it.
- Acceptance: test fails if the `VALID_ID_RE` check is removed or loosened to allow `.` or `/`.

### A3. Timing-unsafe token comparison
- Files under test: `cloud/middleware/auth.js` (has `timingSafeStringEqual` at line 7) and `cloud/services/alphonsoBridgeService.js` (has its own copy at line 9).
- The bug (already fixed): both files used to do plain `===`/`!==` string comparison for API keys/tokens, which leaks timing information. Now both use a `timingSafeStringEqual` helper based on `crypto.timingSafeEqual`.
- Note: these are **two separate, duplicated implementations** of the same helper in two different files. Part of this task is deciding whether that's worth consolidating.
- **Add to `cloud/middleware/auth.test.js` (extend existing file, don't create a new one for this half):**
  - Test `timingSafeStringEqual('abc', 'abc')` → `true`.
  - Test `timingSafeStringEqual('abc', 'abd')` → `false`.
  - Test different-length strings → `false` (this is the case that's easy to get wrong with naive `crypto.timingSafeEqual` usage, since it throws on length mismatch if not handled — check the actual implementation handles this without throwing).
  - Test empty string vs non-empty → `false`, not a thrown exception.
- **Write `cloud/services/alphonsoBridgeService.test.js`** (new file, none exists yet) with the equivalent tests for its copy of the helper, plus at least one test that the bearer-token check at line 126 actually rejects a wrong token and accepts the right one (mock the request/config, don't hit a real network endpoint).
- **Judgment call, make it and document it in your report:** if the two `timingSafeStringEqual` implementations are identical or near-identical, consider extracting one shared helper (e.g. `cloud/utils/timingSafeCompare.js`) that both files import, and update both call sites. This is in-scope because it directly reduces the chance of the two copies drifting (one gets fixed, the other doesn't — exactly the kind of bug this whole handoff exists to prevent). If you do this, make sure both existing call sites (`cloud/middleware/auth.js:74`, `cloud/services/alphonsoBridgeService.js:126`) still pass their tests after the refactor.

### A4. Update `package.json`
- Add every new `.test.js` file from A1–A3 to the `"test"` script string. Run `npm test` and confirm all pass, old and new.

---

## Task Group B — Neutralize the `cloud/roles/*` dead-code trap (no deletion)

- Confirmed dead (verified 2026-08-01): `grep -rln "cloud/roles" --include="*.js" cloud scripts` finds **zero** external `require()`s of anything in `cloud/roles/` — the only matches are the files' own internal comments/paths. The live, actually-imported equivalents are `cloud/utils/approvalQueue.js` and `cloud/utils/negotiationPolicy.js`, which `cloud/executor.js` and `cloud/admin/api.js` import instead.
- **Do NOT delete `cloud/roles/approvalQueue.js`, `cloud/roles/negotiationPolicy.js`, or `cloud/roles/roleDefinitions.js`.** R14 requires Shayan's direct approval for file deletion, and this handoff does not carry that approval.
- Instead:
  1. Add a clear, short header comment to the top of each of the 3 files stating they are dead/superseded and naming the real file to use instead (e.g. `// DEAD CODE — not imported anywhere. Superseded by cloud/utils/approvalQueue.js. Do not extend this file. See docs/governance/DEFERRED_WORK.md (2026-08-01 entry) for removal status.`).
  2. Add an entry to `docs/governance/DEFERRED_WORK.md` following the existing format (`[DATE] <scope>: <what> — <why deferred> — <resume hint> — <status>`), proposing deletion of `cloud/roles/*` pending Shayan's explicit approval. Use today's date.
- Acceptance: no behavior change, `npm test` still passes, the trap is now labeled instead of silently sitting there.

---

## Task Group C — Wire up generic approval-queue Telegram notifications

- File: `cloud/utils/approvalQueue.js`. `notifyOperator(record)` (around line 97) currently only does `console.log` — there's a `// TODO: send Telegram message` that was never implemented. Contrast with `cloud/api/cardRoutes.js` line 56, which already does this correctly for card-purchase approvals via `sendCardApprovalRequest` from `cloud/telegram/cardApprovalBot.js`.
- **Effect of the bug:** card-purchase approvals page you on Telegram. Generic graph-node approvals (anything with `requiresApproval: true` that isn't a card purchase) do **not** — you'd only ever see them by manually polling `/admin/approvals`. This is a real operational gap, not cosmetic.
- **Task:**
  1. Read `cloud/telegram/cardApprovalBot.js` to understand the existing Telegram-send pattern (bot token source, chat id source, message formatting, error handling).
  2. Implement the equivalent for generic approval records inside `notifyOperator(record)` — send a Telegram message summarizing the pending approval (what node, what task/graph it belongs to, how to approve/deny) using the same bot/chat-id configuration the card-approval flow already uses. Do not introduce a second bot token env var if one already exists and is reusable.
  3. Keep the existing `console.log` as a fallback/supplement, not a replacement — if the Telegram send fails (network error, missing config), log the failure clearly but do not throw and break the approval-queue flow itself (this must stay fire-and-forget, matching the existing pattern elsewhere in this codebase for Telegram/notification sends).
  4. **Write `cloud/utils/approvalQueue.test.js`** (or extend if one already exists — check first): test that `notifyOperator` attempts a Telegram send with the correct message content for a fake approval record, using a mocked/injected send function (do not make real Telegram API calls in tests — inject or mock the transport). Test that a failed send doesn't throw out of `notifyOperator`.
- Acceptance: a real generic approval (e.g. manually trigger one via whatever test harness or direct function call is appropriate — do not hit a live endpoint that costs money or affects production data) results in a Telegram-send attempt, verified via test mock, not just code review.

---

## 3. What you are explicitly NOT doing in this handoff (do not scope-creep into these)

- Do not rotate, touch, or reference actual secret values.
- Do not touch `cloud/api/billingRoutes.js` Stripe webhook logic — it was already fixed and is out of scope here.
- Do not touch the `STRIPE_API_KEY` vs `STRIPE_SECRET_KEY` naming (verified 2026-08-01: `STRIPE_API_KEY` is actually the consistent canonical name everywhere; `cloud/server.js:188` has a legacy fallback to `STRIPE_SECRET_KEY` but this is intentional backward-compat, not a bug — a prior audit note calling this "worth investigating" was a false alarm, already documented as such).
- Do not touch Sentry wiring in `scripts/start.js` — it's already correctly soft-guarded (`if (process.env.SENTRY_DSN)` + try/catch), just not the focus of this pass.
- Do not touch pnpm/npm tooling, root launcher scripts (`.bat`/`.vbs`), or anything under `mobile/`, `desktop/`, `ui/`.
- Do not attempt Railway/Supabase/Stripe dashboard actions — you have no access and shouldn't need any for this handoff.

If you find something else broken while in this code (R11 — don't walk past pre-existing bugs), do not silently fix it outside this scope. Record it in `docs/governance/DEFERRED_WORK.md` and mention it in your final report. If it's small, safe, and directly adjacent to a task you're already doing, use judgment — but say so explicitly.

---

## 4. Verification checklist before opening the PR

- [ ] `npm test` passes, output includes all new test files, pasted in full in your report.
- [ ] `bash scripts/verify.sh` (or `scripts/verify.ps1` on Windows) passes, or you've clearly documented which check failed and why.
- [ ] No secrets, tokens, or credentials appear anywhere in your diff (double-check test fixtures use obviously-fake values like `'test-token-123'`, not anything resembling a real key format).
- [ ] `cloud/roles/*` files still exist, unmodified in behavior, only annotated.
- [ ] `docs/governance/DEFERRED_WORK.md` has your new entry.
- [ ] Branch is `agent/deepseek-reliability-hardening`, based on current `master`.
- [ ] Commits use `type(scope): summary` format.
- [ ] PR description lists which `REPO_RULES.md` rules this satisfies (R9, R28, R19 at minimum) and pastes verification evidence per R38.
- [ ] PR is opened against `master`, **left open, not merged.**

---

## 5. Reporting back

When done (or if you get blocked), your final message must state clearly, per task group (A1–A4, B, C):
- `done` / `partial` / `blocked`, with reason if not `done`.
- The actual command output you ran to verify it (not a paraphrase).
- Anything you deviated from in this handoff and why.
- The PR URL.

Do not say "all tests pass" without showing the `npm test` output. Do not say a task is complete if you only wrote the code but didn't run the test.
