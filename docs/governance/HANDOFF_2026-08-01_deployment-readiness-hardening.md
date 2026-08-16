# Handoff: Deployment & Production-Readiness Hardening Pass

Date: 2026-08-01
From: Claude (Sonnet 5), session on repo `ACC`
To: opencode agent (DeepSeek V4 Flash)
Status: **Ready to start.** Supersedes and replaces the earlier, smaller `HANDOFF_2026-08-01_reliability-hardening.md` draft (deleted — that scope was too small; this is the real version).
Governance: This repo is governed by `REPO_RULES.md`. Read it if anything here is ambiguous. Where this doc and `REPO_RULES.md` conflict, `REPO_RULES.md` wins.

---

## 0. The actual problem this handoff solves

This product (ACC — a Node/Express backend on Railway, Supabase auth/DB, Stripe billing, Telegram bot control plane) is **not verifiably production-ready right now, and the tooling that's supposed to prove it is either missing or a no-op.** Concretely, verified today by direct inspection:

1. **Error visibility is completely broken.** `scripts/start.js` calls `require('@sentry/node')` inside a try/catch — but `@sentry/node` is **not in `package.json` and not installed** (`node_modules/@sentry` does not exist). Every single deploy has been running with the `require` throwing, landing in the catch block, silently. Sentry has never actually captured one error in this app's life, despite the code implying otherwise. There is also **zero** process-level crash handling (`uncaughtException`/`unhandledRejection`) and **zero** Express error-handling middleware in `cloud/server.js`. If anything throws outside a route handler's own try/catch, it either crashes the whole process with no record of why, or gets silently eaten.

2. **The CI "deploy-dry" gate is a no-op for this repo's actual deploy target.** `scripts/verify.sh`'s deploy-dry stage (lines 114–127) has a branch for `vercel.json`, a branch for `eas.json`, a branch for `netlify.toml` — and for `railway.json`, which is what this repo actually has, it does this:
   ```bash
   elif [ -f railway.json ] || [ -f railway.toml ]; then
     notice "deploy" "railway target present; run 'railway up --detach' manually"
   ```
   That is a `::notice`, not a check. It always "passes." The required CI status check named `deploy-dry` in `docs/governance/BRANCH_POLICY.md` currently guarantees nothing about whether this app actually boots.

3. **This class of bug already bit twice in production** (`twilio` and `openai` were both `require()`'d in route files but missing from `package.json`, silently disabled by the `safeRequire()` wrapper in `cloud/server.js`, caught only by a manual line-by-line human read-through). There is no automated guard preventing a third occurrence. `safeRequire`/`safeRequireWithName` in `cloud/server.js` (lines 21–31) catch load failures into `moduleLoadStatus`, which is exposed at `GET /admin/modules` — but nothing *pushes* that information anywhere. It's purely pull-based; nobody is paged.

4. **The specific Stripe webhook fix has never been tested against a real webhook payload.** `cloud/api/billingRoutes.js`'s `/webhook` route (line 151) plus `cloud/server.js`'s JSON-parsing-order carve-out (lines ~115–120, `if (req.path...) return express.json()(req,res,next)` skip logic) were fixed together to solve signature verification failing — but that fix was verified by code reading, not by simulating an actual signed Stripe event through the real Express app.

5. **Test coverage is 7 files for 206 non-test `.js` files under `cloud/`.** The untested 96%+ includes `orchestrator.js`, `worker.js`, `queue.js` — the modules that run every single task the whole product exists to run.

**This handoff closes all five gaps, for real, with evidence.** This is genuinely a "can we trust a green CI check on this repo" problem, which is the actual blocker between "code is written" and "code is deployable with confidence." That is the bar for this handoff — not test-file volume for its own sake.

---

## 1. Ground rules (non-negotiable — from REPO_RULES.md)

1. **Never touch `.env`, secrets, or credentials.** No reading, printing, committing, or inventing real values. Use fixture/fake values in tests and scripts, matching the style already used in `cloud/middleware/auth.test.js`.
2. **No file deletion without Shayan's direct approval (R14).** Nothing in this handoff requires deleting anything. If you think something should be deleted, propose it in `docs/governance/DEFERRED_WORK.md` instead — don't do it.
3. **Never commit to `master` directly (R26).** Work on branch `agent/deepseek-deployment-hardening`, branched fresh from up-to-date `master`.
4. **Commit in coherent increments (R9), one commit minimum per task group (A–E below), conventional-commit format (R28):** `type(scope): summary`.
5. **No paid API calls or infrastructure spend without approval (R24).** Every task below is achievable with mocks, fixtures, and local process spawning — no real Stripe/Sentry/Railway network calls, no real Sentry account needed for the code changes (DSN stays unset in CI/tests, which must not crash anything — see Task B).
6. **Do not silently skip anything (R4).** If a file has moved, a function has been renamed, or a described behavior doesn't match reality, say so explicitly in your report — do not quietly route around it.
7. **Open a PR when done. Do not merge it.** Target `master`. Shayan (via a follow-up Claude session) reviews and merges. Say clearly in your report that the PR is open and unmerged.
8. **Evidence, not claims (R38).** Every task group's completion claim must be backed by real, pasted command output — not a description of what should happen.

---

## 2. Repo orientation (facts, verified 2026-08-01 — trust these, don't re-derive)

- Package manager: **npm**. `package-lock.json` is the committed lockfile. Do not introduce pnpm/yarn.
- `"test"` script in `package.json` currently runs a fixed list of `.test.js` files via `node --test` / direct `node`. **Any new test file you add must be appended to that script string or it will never run.**
- Entrypoint chain for production: `railway.json` → `startCommand: "node scripts/start.js"` → `scripts/start.js` requires `cloud/server.js`, which calls `app.listen(PORT, ...)` unconditionally at module load (line 402) and binds `/health` at line 149.
- `Dockerfile` already has a `HEALTHCHECK` hitting `http://localhost:4000/health` — the healthcheck path itself is fine. The gap is that nothing in **CI** proves the app reaches that state.
- `cloud/config/validateEnv.js` already exists and does fail-fast validation of `CRITICAL` env vars in production, `WARN_ONLY` advisory vars in dev. This is decent — extend it, don't rewrite it.
- Stripe SDK is already a dependency (`"stripe": "^22.1.1"` in `package.json`). It ships `stripe.webhooks.generateTestHeaderString(...)`, which lets you construct a **valid, correctly-signed test webhook header locally with no network call** — this is the tool for Task C.
- `supertest` is **not currently a devDependency** — you will need to add it (`npm install --save-dev supertest`) to drive Task C's HTTP-level test against the real Express app without binding a real port conflict (supertest handles ephemeral ports internally).
- `@sentry/node` is **not currently a dependency at all** (confirmed: no `node_modules/@sentry`, no `package.json` entry) — Task B starts by actually installing it.

---

## Task Group A — Dependency Completeness Guard (prevents the twilio/openai bug class forever)

**Goal:** an automated check, wired into `scripts/verify.sh`'s existing `build` or a new stage, that fails CI if any `require()`'d npm package in first-party code (`cloud/`, `scripts/`, root-level `.js`) is missing from `package.json`'s `dependencies`/`devDependencies`. This is a static analysis problem, not a runtime one — solve it that way.

1. Write `scripts/checkDependencies.js`:
   - Walk `cloud/`, `scripts/`, and root-level `*.js` files (exclude `node_modules`, `ui/`, `mobile/`, `desktop/`, any `*.test.js`).
   - For each file, extract `require('pkg')` / `require("pkg")` calls (regex or a light AST parse — regex is fine here, this doesn't need to be bulletproof against dynamic requires, just catch the common static case that bit twice already).
   - Filter out: relative requires (`./`, `../`), Node builtins (`fs`, `path`, `crypto`, `http`, `events`, `child_process`, etc. — use `require('module').builtinModules` to get the real list instead of hand-maintaining one).
   - For scoped packages (`@aws-sdk/client-s3`), take the first two path segments; for unscoped (`express`), take the first segment.
   - Cross-reference the resulting package name set against the union of `dependencies` + `devDependencies` in `package.json`.
   - Any package required in code but absent from `package.json` → print it clearly and exit non-zero.
   - Add an npm script: `"check:deps": "node scripts/checkDependencies.js"`.
2. Wire it into `scripts/verify.sh` as part of the existing `build` stage (find that stage in the file and add the call there) so it's a real, enforced CI gate — not just something a human has to remember to run.
3. Run it against the current repo. **If it finds any currently-missing dependency, do not silently "fix" it by adding a random version to `package.json` — report it in your final message and let it be a deferred/flagged item**, unless it's obviously safe (e.g., exactly the `twilio`/`openai` pattern already fixed and just needs the guard to confirm it's now clean).

---

## Task Group B — Real Sentry wiring (error visibility that actually exists)

1. `npm install --save @sentry/node` (real install, not just a package.json line — commit the resulting `package-lock.json` diff too).
2. In `scripts/start.js`, confirm/fix the existing `if (process.env.SENTRY_DSN) { ... }` block now actually initializes successfully when a DSN is present (it will, once the package is installed) and confirm it still no-ops cleanly with **no DSN set** (must not throw, must not block startup — this is the case that runs in dev/CI/tests, so it must be silent and safe).
3. Add process-level crash visibility in `scripts/start.js` (or wherever the true process entrypoint is — verify before assuming):
   - `process.on('uncaughtException', ...)` and `process.on('unhandledRejection', ...)` handlers that: log the error clearly, call `Sentry.captureException(err)` if Sentry was initialized, then exit the process (crashing loudly and visibly beats limping on in an unknown state — but confirm this matches how the process is supervised, e.g. Railway's `restartPolicyType: "on_failure"` in `railway.json` expects a real crash+restart cycle, so exiting is correct here).
4. Add Express error-handling middleware to `cloud/server.js` — a 4-argument `(err, req, res, next)` middleware registered **after all routes** — that calls `Sentry.captureException(err)` (if Sentry initialized) before responding with a generic 500. Currently there is none at all; any thrown error outside a route's own try/catch has undefined behavior.
5. **Wire `safeRequire`/`safeRequireWithName` failures (in `cloud/server.js`) to Sentry too.** Right now a failed module load only does `console.error` and sets `moduleLoadStatus[name] = { loaded: false, ... }` — nobody is notified. Add a `Sentry.captureMessage(...)` (or `captureException` with the caught error) call in the `catch` block of `safeRequireWithName`, tagged with the module name, so a missing dependency actually alerts instead of only being visible if someone manually polls `GET /admin/modules`.
6. **Tests** (`cloud/server.test.js` or wherever is appropriate — check whether `cloud/server.js` is currently structured in a way that's importable/testable without side effects; if `app.listen` firing unconditionally on require makes this awkward, that's fine — test what you can in isolation, e.g. extract nothing structurally risky, but at minimum test `safeRequireWithName`'s Sentry-call behavior with a mocked/injected Sentry client, and test the error middleware function directly by calling it with a fake `err`/`req`/`res`/`next` and asserting it calls the mocked Sentry capture and responds with 500). Use dependency injection or `require.cache` mocking for the Sentry module in tests — do not let tests attempt a real network call to Sentry (there will be no DSN in the test environment, which should make this a non-issue if you built step 2 correctly).

---

## Task Group C — Stripe webhook end-to-end regression test (real signed payload, no network)

1. `npm install --save-dev supertest`.
2. Write `cloud/api/billingRoutes.test.js`:
   - Build a minimal Express app instance that mirrors the real mount order in `cloud/server.js` — specifically, replicate the JSON-parsing skip logic (the `if (req.path === ...) return express.json()(req,res,next)` carve-out) and the auth-gate exclusion for `/webhook`, so this test actually exercises the two things that were fixed, not just the route handler in isolation.
   - Use `stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp })` to build a real, valid `Stripe-Signature` header for a fixture event payload (a minimal `checkout.session.completed` or similar — check what event types `billingRoutes.js`'s webhook handler actually branches on and use one it handles).
   - Set a fixture `STRIPE_WEBHOOK_SECRET` env var for the test (fake value, consistent with the signature generation — this is not a real secret, it's a shared test fixture value, matching the existing pattern of fake test tokens elsewhere in this repo's test suite).
   - Send the request via `supertest` as **raw bytes** (not JSON-serialized-then-reparsed) with the correct `Stripe-Signature` header and `Content-Type: application/json`, and assert:
     - The route returns 200 (signature verification succeeded — proves the JSON-parsing-order fix holds).
     - The request succeeds **without any `Authorization` bearer header** (proves the auth-gate exclusion for `/webhook` holds — send a request that would otherwise fail `requireOperatorOrAdmin` and confirm this specific path is exempt).
     - A tampered payload (signature doesn't match body) is rejected (400/401, whatever `billingRoutes.js` actually returns on `constructEvent` throwing — check the real code, don't guess the status code).
3. This is the single highest-value test in this whole handoff — it directly protects against the exact bug class already found once in this billing path. Do not skip or shortcut it.

---

## Task Group D — Make the `deploy-dry` CI gate real for Railway

1. Write `scripts/deployDryRun.js`:
   - Spawn `node scripts/start.js` as a child process with a **non-conflicting `PORT`** (e.g. `PORT=4009`) and a minimal but complete fake env (enough fake `CRITICAL` vars from `cloud/config/validateEnv.js` to pass validation — fake values, not real ones) so it doesn't immediately `process.exit(1)`.
   - Poll `http://localhost:4009/health` for up to ~15s (short retry loop) until it returns 200, or fail loudly if it never does.
   - Once healthy, also hit `GET /admin/modules` (with whatever auth it requires — check `cloud/admin/api.js`; if it requires an admin key, generate a fixture one via the same fake env you set) and assert that no **non-optional** module in `moduleLoadStatus` shows `loaded: false`. (Decide "non-optional" by checking which `safeRequire` calls in `cloud/server.js` correspond to routes actually mounted/required for core function vs. genuinely optional integrations — use judgment, document the list you chose in a comment.)
   - Kill the child process cleanly (`SIGTERM`, with a fallback `SIGKILL` if it doesn't exit within a few seconds) and exit with the correct status code for CI (0 on success, 1 on any failure above).
2. Replace the current no-op `railway.json` branch in `scripts/verify.sh`'s deploy-dry stage (the `notice "deploy" "railway target present; run 'railway up --detach' manually"` line) with a call to `node scripts/deployDryRun.js`, wired the same way the other stages report `error`/`notice`.
3. Run it locally, confirm it actually catches a failure: temporarily break something trivial (e.g. rename `/health` to `/healthx` locally, uncommitted), run the script, confirm it fails loudly, then revert. Mention this verification step in your report.

---

## Task Group E — Test coverage for the modules that run every task

Current state: `orchestrator.js`, `worker.js`, `queue.js` in `cloud/` have **zero** test coverage despite being the execution core of the whole product (everything the product does routes through these).

1. Read all three files first to understand their actual exported surface and side effects before writing anything.
2. Write `cloud/queue.test.js`: cover `enqueueTask`/`getTask` (the two functions already imported by `cloud/server.js`) — happy path (enqueue then retrieve), not-found case, and whatever validation/error paths exist on bad input. Use fixtures/in-memory state, not a real queue backend, unless the module is already structured to require one (check first).
3. Write `cloud/worker.test.js`: cover `startWorker`'s core dispatch logic — at minimum, that a task handed to the worker reaches the correct handler/graph execution path, and that a handler throwing doesn't crash the whole worker loop (if that's the intended behavior — verify from the code, don't assume).
4. Write `cloud/orchestrator.test.js`: cover whatever `orchestrator.js` actually exports as its primary entrypoint(s) — at minimum one realistic happy-path task orchestration and one error/failure path. If `orchestrator.js` is large and has genuinely separable concerns, it's fine to scope this to the highest-risk/most-central function rather than 100% line coverage — use judgment, and say clearly in your report what you covered vs. what you deliberately left for a future pass.
5. Add all new test files to the `"test"` script in `package.json`.

This task group is intentionally scoped to the three highest-leverage files, not "add tests everywhere" — going broader than this is good but not required for this handoff to count as done; going narrower than these three specific files does not count as done.

---

## 3. What you are explicitly NOT doing in this handoff

- Not touching `.env`, real secrets, or any dashboard (Railway/Stripe/Supabase/Sentry account setup) — you have no access and none is needed for any task above.
- Not rotating any keys.
- Not touching `mobile/`, `desktop/`, `ui/` — backend-only scope.
- Not deleting `cloud/roles/*` or any other file (R14) — if you notice dead code while in this area, record it in `docs/governance/DEFERRED_WORK.md`, don't act on it.
- Not attempting a real `railway up` deploy or any billable action (R24).
- Not changing `validateEnv.js`'s actual `CRITICAL`/`WARN_ONLY` var lists unless a task above explicitly requires it (Task D needs to know what fake values satisfy them, not change what's required).

If you find something else broken while working in this code (R11), don't silently fix it outside scope — record it in `docs/governance/DEFERRED_WORK.md` with today's date and mention it in your final report. Use judgment on anything small, safe, and directly adjacent to a task you're already doing — but say so explicitly either way.

---

## 4. Verification checklist before opening the PR

- [ ] `npm run check:deps` exists, runs, and is wired into `scripts/verify.sh`.
- [ ] `npm test` passes, including all new test files (Tasks B, C, E), output pasted in full in your report.
- [ ] `@sentry/node` is a real installed dependency; `package-lock.json` diff reflects it.
- [ ] Starting the app with no `SENTRY_DSN` set does not throw or block startup (confirm by running `node scripts/start.js` locally with the var unset and observing clean startup).
- [ ] `cloud/api/billingRoutes.test.js` passes and specifically proves signature verification + auth-gate exclusion both still work.
- [ ] `scripts/deployDryRun.js` exists, is wired into `scripts/verify.sh`'s deploy-dry stage replacing the old no-op notice, and you've demonstrated (locally, then reverted) that it actually fails when something is broken.
- [ ] `bash scripts/verify.sh` (or `.ps1` on Windows) passes end-to-end, or you've clearly documented which check fails and why.
- [ ] No secrets, tokens, or credentials anywhere in your diff — test fixtures use obviously-fake values.
- [ ] `docs/governance/DEFERRED_WORK.md` has any new entries for things you found but didn't fix.
- [ ] Branch is `agent/deepseek-deployment-hardening`, based on current `master`.
- [ ] Commits use `type(scope): summary` format, one or more per task group.
- [ ] PR description lists which `REPO_RULES.md` rules this satisfies (R9, R28, R19, R38 at minimum) and pastes verification evidence.
- [ ] PR is opened against `master`, **left open, not merged.**

---

## 5. Reporting back

When done (or if you get blocked), your final message must state clearly, per task group (A–E):
- `done` / `partial` / `blocked`, with reason if not `done`.
- The actual command output you ran to verify it (not a paraphrase).
- Anything you deviated from in this handoff and why.
- The PR URL.

Do not say "all tests pass" without showing the `npm test` output. Do not say a task is complete if you only wrote the code but didn't run it and observe the result yourself.
