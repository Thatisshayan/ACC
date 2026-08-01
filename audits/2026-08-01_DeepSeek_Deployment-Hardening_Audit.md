# Deployment & Production-Readiness Hardening Audit — 2026-08-01

Agent: DeepSeek (opencode)
Scope: Execute Task Groups A–E of `docs/governance/HANDOFF_2026-08-01_deployment-readiness-hardening.md` — dependency-completeness guard, real Sentry wiring, Stripe webhook e2e regression, real Railway deploy-dry gate, and test coverage for the execution core (`queue.js`, `worker.js`, `orchestrator.js`).
Status: completed (all 5 task groups done; PR open, unmerged)

## Method
1. Branched `agent/deepseek-deployment-hardening` fresh from `master` (`bfa01af`); one conventional commit per task group.
2. Verified every task with real command output (`npm run check:deps`, `npm test`, boot checks via spawned `node scripts/start.js`, `node scripts/deployDryRun.js`, and a forced-failure negative test that was reverted).
3. Confirmed a no-DSN boot (`SENTRY_DSN` force-emptied) starts cleanly and `/health` returns 200.
4. Ran `scripts/verify.ps1` end-to-end and characterized the two remaining local-only blockers (see Findings).

## Findings

### 1. All five task groups complete (see PR for evidence pasted per group)
- **A — check:deps**: `scripts/checkDependencies.js` (regex + comment-stripping scanner over `cloud/`, `scripts/`, root `.js`) wired into `verify.sh`/`verify.ps1` build stages. Now fully green: `checkDependencies: OK — all require()'d packages (240 first-party files scanned) are present in package.json.` It caught `form-data` (genuine gap) and `@sentry/node` (expected) during development.
- **B — Sentry**: `@sentry/node@10.69.0` installed (lockfile reflects it). `cloud/utils/sentry.js` wrapper, `cloud/utils/safeRequire.js` (extracted, caller-relative resolution via `createRequire` — a naive extraction would have broken the six optional `./api/*` requires), `cloud/utils/errorMiddleware.js` (500 + Sentry capture). `scripts/start.js` now captures `uncaughtException`/`unhandledRejection`, flushes, exits 1. No-DSN boot verified clean.
- **C — Stripe webhook**: `cloud/api/billingRoutes.test.js` drives a locally-signed `Stripe-Signature` through an app mirroring the real server.js mount order (JSON carve-out + auth-gate exemption). Asserts valid→200 no-auth, protected path→401, tampered→400, and a negative control proving the carve-out is load-bearing.
- **D — deploy-dry**: `scripts/deployDryRun.js` spawns `node scripts/start.js` (NODE_ENV=production, hermetic fake env, external-call keys force-empty, `SUPABASE_URL` pinned to 127.0.0.1), polls `/health`, then asserts all 6 modules in `/api/admin/modules` loaded:true. Replaces the old no-op railway notice in both verify scripts. Verified PASS on healthy boot and FAIL when `/health` was temporarily renamed (reverted).
- **E — core coverage**: `cloud/queue.test.js`, `cloud/orchestrator.test.js`, `cloud/worker.test.js`. Worker tests run the real `workerLoop`+queue in isolated child processes with `executor.js` mocked via `require.cache`, proving dispatch→completed and that a throwing handler fails the task without killing the loop.

Full suite: `npm test` → 75 pass / 0 fail (was 47 baseline).

### 2. Bug found and fixed during the pass
- Extracting `safeRequire` to `cloud/utils/` silently changed relative module resolution: `require("./api/...")` was resolving against `cloud/utils/` instead of `cloud/`, causing all six optional modules to report `LOAD FAIL`. Caught by the no-DSN boot check; fixed with `module.createRequire` keyed to the caller's directory; behavior now matches the original in-file functions.

### 3. Remaining blockers to a fully green `verify.ps1` on this machine (both environmental, not code)
- `npm ci` takes ~7 min locally, exceeding the 300s `RunTimed` budget in the build stage; the install succeeds but is killed at 300s, cascading into a failed deploy-dry (node_modules incomplete). CI runners stay within budget. Recorded in DEFERRED_WORK.
- Filename secret-scan flags the local runtime artifact `data/messages/messenger.key` (gitignored, untracked — absent in clean CI checkouts). Recorded in DEFERRED_WORK.
- Pre-existing: `bash -n` fails at `scripts/verify.sh` line 40 under Git-Bash on Windows (secret-scan heredoc); the same file parses fine under Linux bash (CI). Not a CI blocker.

## Notes / observations
- Local `.env` (untracked, not committed) contains a `SENTRY_DSN` whose value is an obvious test string; the app tolerates it (Sentry logs an invalid-DSN warning and continues). Not a repo concern.
- `cloud/queue.js` `enqueueTask` has no input validation (found while testing); recorded in DEFERRED_WORK.

## Artifacts
- Audit of `data/messages/messenger.key`: ignored via `.gitignore:11 data/messages/`; untracked; runtime-generated.
- PR: open against `master`, not merged (see PR description for evidence).
