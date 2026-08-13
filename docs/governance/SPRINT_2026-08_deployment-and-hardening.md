# Sprint: Deployment, Security & Reliability Hardening (2026-08)

Date: 2026-08-01
From: Claude (Sonnet 5)
To: opencode agent (DeepSeek V4 Flash)
Governance: `REPO_RULES.md` governs everything in this sprint. Read it once now if you haven't. Where any phase below conflicts with it, `REPO_RULES.md` wins.

---

## 0. What this document is

This is a **multi-phase sprint**, not a single task. `HANDOFF_2026-08-01_deployment-readiness-hardening.md` (same directory) is **Phase 0** of this sprint — if you haven't done it yet, do it first, it's a prerequisite. Everything below is Phases 1–7, meant to run **immediately after Phase 0, without stopping to wait for a human between phases.**

You will not be re-prompted between phases. Read this whole document, then work straight through Phase 1 → Phase 7 in order, committing as you go, only stopping if you hit a genuine blocker (missing access, a fact in this doc that turns out to be wrong, a decision only Shayan can make). "I finished a phase" is not a stopping point — move to the next one.

---

## 1. Working agreement for this whole sprint

1. **One branch for the whole sprint.** Continue on `agent/deepseek-deployment-hardening` (the branch Phase 0 used) — do not create a new branch per phase. If Phase 0 hasn't happened yet in this session, create that branch off current `master` now and start there.
2. **One evolving PR.** After Phase 0's commits exist, open the PR against `master` as a **draft PR** titled `Deployment, Security & Reliability Hardening Sprint (2026-08)`. After each phase, push your commits and update the PR description with a running log: phase name, status, verification evidence. Keep it open and in draft the entire sprint — do not mark ready for review or merge it yourself.
3. **Commit per logical unit of work within a phase**, conventional-commit format (`type(scope): summary`), not one giant commit per phase and not one commit per line changed.
4. **Every phase ends with real command output**, pasted into your running PR description update, proving what you claim. No "should work now."
5. **If a phase turns out to be already partially done** (something described as broken is actually fine, or vice versa), say so in the PR log and adjust — don't force a fix onto something that isn't broken, and don't skip something that turns out to still be broken.
6. **Deferred/found-but-out-of-scope items** go in `docs/governance/DEFERRED_WORK.md`, dated, every time — not just at the end.
7. Same hard boundaries as Phase 0: no secrets touched/invented, no file deletions anywhere (R14), no direct commits to `master`, no paid API calls or real external network hits (Stripe/Sentry/Railway/Telegram/Supabase) — everything here is mocks, fixtures, local process spawning, and static analysis.
8. When all 7 phases are done (or you hit a genuine blocker on all remaining ones), stop, do a final full run of `npm test` + `bash scripts/verify.sh`, paste that output, and post a final summary message with status per phase and the PR URL.

---

## Phase 1 — Security & Authz Audit

**Correction (2026-08-01):** an earlier draft of this doc claimed all three `alphonsoBridge.js` routes were unauthenticated. That was wrong for `POST /` — verified by reading the actual code: `POST /` delegates into `handleAlphonsoBridgePacket()` in `cloud/services/alphonsoBridgeService.js`, which correctly checks the `ALPHONSO_BRIDGE_TOKEN` bearer token (`timingSafeStringEqual`, line ~126) before accepting a packet, matching the documented `setup_required`/`unauthorized`/`recorded` truth labels in `docs/ALPHONSO_BRIDGE_RECEIVER.md`. This bridge exists to receive packets from a separate project (Alphonso/AlphonsoEcosystem) — **do not add auth to `POST /`, it already has the correct auth, and do not change its shape.**

**The real, narrower, confirmed finding:** `GET /status` and `GET /packets` in `cloud/api/alphonsoBridge.js` have **no token check at all** — they call `getBridgeStatus()` / `listPackets()` directly with zero auth. `/status` is a low-risk probe (config/health only). `/packets` is the real issue: it returns up to 100 actual stored packets — real `content_job`/`task`/`result`/`approval`/`memory` payloads — to anyone who finds the URL, no token required. Confirmed with Shayan (2026-08-01): `GET /packets` should require the same `ALPHONSO_BRIDGE_TOKEN` bearer check as `POST /`.

1. Read `cloud/api/alphonsoBridge.js` and `cloud/services/alphonsoBridgeService.js` to find the existing bearer-token check used by `POST /` (in `handleAlphonsoBridgePacket()` / around the `timingSafeStringEqual` call).
2. Extract that check into a small reusable middleware (don't duplicate the comparison logic) and apply it to `GET /packets`. Apply the same check to `GET /status` too unless you find clear evidence in `docs/ALPHONSO_BRIDGE_RECEIVER.md` that `/status` is meant to be an open probe (it currently reads that way — "Operator Status" section doesn't mention auth — so leaving `/status` open is fine unless you find something that says otherwise; state which way you went and why).
3. Do **not** change `POST /`'s existing auth behavior — it's already correct.
4. Write `cloud/api/alphonsoBridge.test.js` proving: `GET /packets` without a valid token is rejected, with a valid token succeeds; `POST /` continues to behave exactly as it does today (regression-only for that route, not a new check).
5. **Systematic sweep, not just this one file:** every `app.use(...)` mount in `cloud/server.js` (there are ~25) either has an auth middleware in the `app.use(...)` call itself, OR the router file self-gates every route internally (like `phoneRoutes.js` and `securityApproval.js` already correctly do), OR is a legitimately public route (health check, static UI assets, public webhook with its own secret check). Go through the full mount list in `cloud/server.js` (roughly lines 264–398) and classify every single one into "properly gated" / "public-by-design, verified" / "gap found." Fix any real gap the same way you fixed `alphonsoBridge.js`. Record your classification table in the PR log even for the ones that were already fine — this is the audit deliverable, not just the fix.
6. Review the CORS config (`app.use(cors({...}))` near line 95) and the rate limiter (`limiter`, near line 122) — confirm they apply broadly enough (check the `skip` logic at line 66) and aren't accidentally excluding routes that should be rate-limited. Fix if you find a real gap; otherwise state you checked and it's fine.

---

## Phase 2 — Provider/Connector Reliability Sweep

**Context:** `cloud/taskbus/providerFallback.js` previously had a real bug — `tryAlibaba()` returned bare `null` on its disabled/error paths instead of the `{ tried, success, reason }` shape every sibling function (`tryPerplexity`, `tryDeepSeek`, `tryOllama`, `tryClaude`) returns, and `executeWithProviderFallback()` does `if (result.tried)` unconditionally — so a null result crashed the whole task with `Cannot read properties of null`. This was fixed for Alibaba specifically. **Nobody has verified the other four provider functions can't hit the same failure mode**, and there's no test locking any of them to the correct return shape.

1. Read all five `try*` functions in `providerFallback.js` (`tryPerplexity`, `tryDeepSeek`, `tryAlibaba`, `tryOllama`, `tryClaude`) end to end. For each one, trace every return path (disabled/not-configured, network/API error, malformed response, success) and confirm every single path returns the `{ tried, success, ... }` shape — no bare `null`, no bare `undefined`, no thrown-and-uncaught exception that would propagate past `executeWithProviderFallback()`'s `if (result.tried)` check.
2. Fix any function where a path can still produce something other than the expected shape (apply the same fix pattern already used for `tryAlibaba`).
3. Write `cloud/taskbus/providerFallback.test.js`: for each of the five providers, test the disabled-path, the success-path (mocked), and the error-path, asserting the return shape is always `{ tried, success, ... }`-conformant, never `null`/`undefined`, never throws. Also test `executeWithProviderFallback()` itself with a mix of disabled and failing providers to confirm it falls through correctly to the next one and never crashes on a malformed intermediate result.
4. Extend this same "does every path return the documented shape, never null/throw" check to `cloud/connectors/*` and `cloud/connectors/integrations/*` if they follow a similar adapter-pattern contract (check `cloud/connectors/stripe.js` as a reference — it already looks like it follows `{ success, ... }` conventions). Scope: pick the 3–4 connector files most likely to be exercised by real task flows (check `cloud/graphRunner.js` / `cloud/orchestrator.js` for which connectors are actually invoked in built-in graphs) rather than every file in the directory — say in your report which ones you covered and why you picked them.

---

## Phase 3 — Test Coverage: Taskbus & Integrations

Builds on Phase 0's Task Group E (which covered `orchestrator.js`, `worker.js`, `queue.js`). This phase covers the next tier down: the modules those three actually call into.

1. Read `cloud/taskbus/router.js` (already partially tested — check `cloud/taskbus/router.test.js` first to see what's covered vs. not) and `cloud/taskbus/store.js` (also has a `.test.js` — check coverage gaps rather than assuming zero coverage).
2. Identify the 3 highest-risk **currently-untested** files in `cloud/taskbus/`, `cloud/hub/`, `cloud/autonomy/` — "highest risk" means: most central to task execution, most recently changed, or most likely to be hit by every request (check `cloud/server.js`'s route mounts for `taskbus`, `hub`, `autonomy` to see what's actually wired to live traffic). Write tests for those 3 first.
3. If time/scope allows within this phase, continue to the next-highest-risk untested files in the same directories. There is no fixed file count required here — the requirement is that you make a real, documented judgment call about what's highest-risk and cover it, not that you hit an arbitrary number.
4. Add every new test file to `package.json`'s `"test"` script.

---

## Phase 4 — Dependency & Vulnerability Remediation

**Context:** a prior `npm audit fix` (non-breaking) already reduced vulnerabilities from 15 to 9. The remaining 9 all collapse to two breaking major-version bumps that were explicitly deferred pending a tested upgrade: `node-telegram-bot-api` (currently `^0.67.0` in `package.json`) → `1.2.0`, and `uuid` (currently pinned `8.3.2`) → `14.x`. This repo's entire Telegram bot control plane (`cloud/telegram/bot.js`, ~1700+ lines, and everything importing it) depends on `node-telegram-bot-api`'s API shape, so this is a real, non-trivial upgrade — not a version-bump-and-hope.

1. Run `npm audit` fresh, confirm the current state matches this description (report if it's drifted).
2. Research what changed in `node-telegram-bot-api` between `0.67.0` and `1.2.0` (check its CHANGELOG/release notes if vendored, or reason from its README in `node_modules` — do not fetch external URLs). Identify every breaking API change relevant to how `cloud/telegram/bot.js` and any other file requiring `node-telegram-bot-api` actually use it (grep for the import and every method call on the bot instance).
3. Upgrade `node-telegram-bot-api` to `1.2.0`, fix every call site that changed shape, and confirm `npm test` still passes plus any Telegram-bot-specific tests (if none exist, write a minimal one covering bot instantiation and the most-used method call pattern with a mocked transport — do not hit the real Telegram API).
4. Upgrade `uuid` to `14.x`. This package is almost certainly ESM-only or has an import-style change at that major version — check `node_modules/uuid/package.json`'s `"exports"`/`"type"` field to confirm, and update every `require('uuid')` call site in `cloud/` accordingly (likely needs to become a named import pattern compatible with CommonJS interop, or a dynamic `import()` if pure ESM — verify empirically rather than assuming).
5. Run `npm audit` again after both upgrades and report the before/after vulnerability count in your PR log.
6. If either upgrade turns out to be riskier than expected (e.g., `node-telegram-bot-api` 1.x requires a bot-token/webhook-registration behavior change that can't be verified without live Telegram access), stop, do not force it through, and record it as deferred with a clear explanation instead.

---

## Phase 5 — Dead Code & Structural Cleanup

1. **Formalize the `cloud/roles/*` situation** (flagged but not deleted in earlier work — R14 still applies, do not delete). Build a small script, `scripts/findOrphanModules.js`, that walks `cloud/` for `.js` files with zero incoming `require()` references from any other first-party file (excluding the file's own `.test.js` and excluding files that are themselves valid entrypoints like `cloud/server.js`, `cloud/worker.js`, `cloud/telegram/bot.js` — build a small allowlist of known entrypoints). Run it, and confirm `cloud/roles/approvalQueue.js`, `cloud/roles/negotiationPolicy.js`, `cloud/roles/roleDefinitions.js` show up (they should, per prior verified findings) — but also check whether the script finds **other** orphaned files nobody has looked at yet.
2. Add `npm run check:orphans` wired to this script. Do not make it a hard CI failure (orphan files are a judgment call, not automatically wrong) — wire it as a `notice`-level, non-blocking report in `scripts/verify.sh`, consistent with how other advisory (non-`error`) findings are surfaced there.
3. For any **newly found** orphan file (beyond the already-known `cloud/roles/*`), do not delete it (R14) — add each one to `docs/governance/DEFERRED_WORK.md` with today's date, the file path, and a one-line note on what it appears to have been superseded by (if you can tell) or "purpose unclear, needs human review" if you can't.
4. This phase does not touch `cloud/roles/*` beyond what Phase 0/earlier work already did (the header-comment annotations) — if those annotations aren't there yet from an earlier session, add them now following the same pattern; if they are, leave them.

---

## Phase 6 — Documentation & Reproducibility (R23)

**R23 requires:** `README.md` + `.env.example` must let a fresh agent stand the repo up with no hidden manual steps.

1. Read `README.md` and `.env.example` fully, then attempt to actually follow the setup instructions mentally, step by step, cross-checking every referenced file, script, and env var actually exists and matches current reality (e.g., does `README.md` reference `npm run cloud:api` correctly per the real `package.json` scripts list; does `.env.example` list every var `cloud/config/validateEnv.js`'s `CRITICAL` and `WARN_ONLY` arrays require, with no var listed in code but missing from the example file, and vice versa).
2. Fix every drift you find: missing env vars in `.env.example` (add with placeholder/dummy values, never real ones), stale script names, broken relative links in `README.md`.
3. Check `docs/README.md` (the docs index) links to every doc that should be discoverable per R1 — including this sprint doc and the Phase 0 handoff doc, so a future agent picking up the repo can find them. Add links if missing.
4. This phase does **not** require writing new prose documentation beyond what's needed to fix drift — the goal is accuracy, not volume.

---

## Phase 7 — Observability & Logging Consistency

1. Read `cloud/utils/logger.js` (already has a `.test.js`) to understand the existing structured-logging convention.
2. Grep across `cloud/` for raw `console.log`/`console.error`/`console.warn` calls **outside** of `cloud/utils/logger.js` itself and outside intentional CLI/startup-banner output (e.g., `scripts/start.js`'s one-time boot messages are fine to leave as-is — use judgment on what's "structured application logging" vs. "human-readable startup banner"). For the application-logging cases, especially anywhere handling task execution (`cloud/orchestrator.js`, `cloud/worker.js`, `cloud/taskbus/*`), convert to the shared `logger.js` convention so log output is consistent and (if the logger supports it) machine-parseable.
3. If `cloud/taskbus`/`cloud/orchestrator` task execution doesn't already carry some kind of correlation/task ID through its log lines, check whether one is available in-context (a `taskId` is threaded through function signatures in several places per earlier reading) and thread it into the log calls you're touching, so a single task's execution can be traced across log lines. Do not invent a new ID scheme if one already exists — reuse it.
4. Do not do a wall-to-wall rewrite of every log line in the codebase — scope this to the task-execution hot path (`orchestrator`, `worker`, `taskbus`) plus anywhere Phase 0–6 already touched code in this sprint (consistency in files you've already modified is in scope; a full-repo logging rewrite is not).

---

## Global out-of-scope (applies to every phase above)

- No `.env`, real secrets, or dashboard/account access of any kind (Railway, Stripe, Supabase, Sentry, Telegram) — every phase is achievable with mocks, fixtures, static analysis, and local process spawning.
- No file deletions anywhere (R14) — flag and defer instead, every time.
- No `mobile/`, `desktop/`, `ui/` changes — backend (`cloud/`, `scripts/`, root config) only, unless a phase explicitly says otherwise (none do).
- No merging your own PR.
- If any phase's stated facts don't match what you find in the repo, stop for that phase, report the mismatch clearly, and move to the next phase rather than guessing or forcing a fix onto a premise that turned out to be wrong.

---

## Final report format (after Phase 7, or after the last phase you reach)

Per phase: `done` / `partial` / `blocked` + reason, real command output, deviations, anything deferred. Then: final `npm test` output, final `bash scripts/verify.sh` output, the PR URL, and confirmation the PR is still open/draft and unmerged.
