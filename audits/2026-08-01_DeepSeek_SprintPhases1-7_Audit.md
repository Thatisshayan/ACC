# Deployment & Production-Readiness Hardening Audit — Phases 1-7 — 2026-08-01

Agent: DeepSeek (opencode)
Scope: Execute the full 7-phase sprint in `docs/governance/SPRINT_2026-08_deployment-and-hardening.md` on branch `agent/deepseek-deployment-hardening`, keeping ONE draft PR (#7) evolving, then final `npm test` + `bash scripts/verify.sh` with a full per-phase report.
Status: completed (Phases 1-7 done; PR draft, open, unmerged)

## Method
1. Branched `agent/deepseek-deployment-hardening` fresh from `master`; one conventional commit per phase (Phase 1 → 7), pushed after each.
2. Ran the full `npm test` suite after every phase; every phase green before moving on.
3. Audited real code (grep/read), never guessed; no network (tests use mocks/require.cache), no real secrets touched, no paid API/infra spend.
4. Every out-of-scope finding appended to `docs/governance/DEFERRED_WORK.md` dated, per Rule 12.
5. PR body updated with a per-phase running log after each phase.

## Phase outcomes
- **Phase 1 — Security/AuthZ (commit 4c979cb)**: Added `requireBridgeToken` middleware to `cloud/api/alphonsoBridge.js` reusing the service's exported `authorizeBridgeRequest` (401 `unauthorized`/503 `setup_required` shape) — gates `GET /status` and `GET /packets`. New `cloud/api/alphonsoBridge.test.js` (9 cases, per-case temp data dir). README auth contract updated. Route sweep found unauthenticated `GET /api/task/:id` → DEFERRED_WORK. 84/84 pass.
- **Phase 2 — Provider fallback shape (commit c6f113c)**: Audited all five `try*` in `cloud/taskbus/providerFallback.js`; fixed `tryOllama` (unguarded `generate()`), fixed `tryAlibaba` success shape to standard `data.{summary,output,files_changed,risks,next_request}`, normalized disabled paths, exported `try*` funcs. New `providerFallback.test.js` (21 cases). Connector sweep: all already `{success,...}`-safe. 105/105 pass.
- **Phase 3 — Test coverage taskbus/hub/autonomy (commit c095b43)**: Covered the 3 highest-risk untested live-mount files — `routes.test.js` (20 cases, real SQLite store + require.cache stubs for destructured deps), `hub/routes.test.js` (11 cases), `autonomy/loop.test.js` (10 cases). Deliberately not tested: live integration probe route. 140/140 pass.
- **Phase 4 — Dependency remediation (commit 957cea3)**: `node-telegram-bot-api` ^0.67.0→^1.2.0 (removed request tree, cleared 8/9 findings; lib has zero call sites — unused dep recorded). `uuid` → **11.1.1 not 14.x** — uuid@14 is ESM-only, deploy target is `node:20-alpine` (CJS); 11.1.1 is last CJS-compatible major AND clears advisory. `npm audit fix` (qs 6.14.2→6.15.3). **`npm audit`: 0 vulnerabilities** (was 9). New `botApi.test.js` over mocked `fetch`. 142/142 pass.
- **Phase 5 — Dead code (commit 4b546ca)**: New `scripts/findOrphanModules.js` + `npm run check:orphans`, wired into `scripts/verify.sh` as non-blocking `::notice`. Confirmed `cloud/roles/*` orphaned (annotated all 3 with `[ORPHAN]` headers) + found 32 more dead modules (all recorded in DEFERRED_WORK, R14 kept). 142/142 pass.
- **Phase 6 — Docs & reproducibility R23 (commit c902ac6)**: Removed stale banner, fixed `cd ACC`, fixed stale env var names in README env section, pointed at `.env.example` as canonical. Verified `.env.example` covers every `validateEnv.js` CRITICAL + WARN_ONLY var (both directions). `docs/README.md` index now links sprint doc + user manual + alphonso bridge + outreach-crm + crewai + archive (R1). All relative links resolve. 142/142 pass.
- **Phase 7 — Observability (commit 712d95a)**: Threaded `task=<id>` through task-execution logging in `cloud/worker.js` (all per-task lines), `taskbus/telegramCommands.js` (log helpers + createTask/routing/error lines), `taskbus/providerFallback.js` (Alibaba), `taskbus/store.js` (approval resolution warns) → shared `cloud/utils/logger.js`. Kept one-time boot/recovery banners as console (exemption). 142/142 pass.

## Final verification
- `npm test`: **142/142 pass** (29 suites, 0 fail).
- `bash scripts/verify.sh` (Git-Bash on Windows): secret-scan/deploy-dry/orphan-lint report local-only interop failures — `data/messages/messenger.key` (known local artifact, absent in CI, DEFERRED_WORK), GNU `timeout` cannot spawn Windows `node.exe` (rc=127 deploy-dry; `command -v node` skips orphan-lint). Verified direct `node scripts/deployDryRun.js` (PASS, 6 modules + /health) and `node scripts/findOrphanModules.js` both work — the failures are Git-Bash/MSYS interop, not code. Linux CI unaffected. Recorded in DEFERRED_WORK.
- PR #7: draft, base `master`, head `agent/deepseek-deployment-hardening`, OPEN/unmerged (never marked ready; never merged).

## Deferred (Rule 12) — see `docs/governance/DEFERRED_WORK.md`
All items appended during this sprint: GET /api/task/:id unauth; node-telegram-bot-api unused dep; 32 dead-code orphans (incl. malformed job-workflow-runner.js); Git-Bash-only verify.sh interop quirks; plus pre-existing entries.

## Artifacts
- PR: https://github.com/Thatisshayan/ACC/pull/7 (draft, open, unmerged) — per-phase log in body.
- Commits: 4c979cb, c6f113c, c095b43, 957cea3, 4b546ca, c902ac6, 712d95a, 503b3d2.
