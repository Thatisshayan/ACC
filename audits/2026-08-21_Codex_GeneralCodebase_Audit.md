# General Codebase Audit — 2026-08-21

Agent: Codex
Scope: Repository-wide, code-based audit of ACC with emphasis on architecture, execution flow, approval enforcement, operational resilience, testing, maintainability, and product-fit. This audit is grounded primarily in current code inspection and verification, not project prose.
Status: completed

## Executive Summary

ACC is currently a single-owner agent orchestration platform centered on a Node/Express control plane, a task bus, a connector/integration surface, and multiple operator interfaces: web UI, Telegram, mobile, and desktop. The real runtime center of gravity is `cloud/server.js`, `cloud/taskbus/*`, `cloud/executor.js`, `cloud/worker.js`, and the Telegram/bot paths.

From the code, ACC already behaves like a personal operations console for:
- task routing across multiple AI/provider backends,
- external-action workflows such as messaging, calling, publishing, billing, and marketplace actions,
- approval-gated review in some flows,
- lightweight persistence for tasks/results/approvals,
- status/ops visibility through API, WebSocket, admin routes, and UI.

The codebase is materially stronger than a prototype in test coverage and breadth, but it is not yet consistently enforcing its own safety model. The biggest issue is not generic code quality; it is control-plane inconsistency. Some execution paths honor approval-first semantics, while others bypass them entirely or only partially enforce them.

Overall assessment:
- Product direction: clear
- Implementation breadth: high
- Backend test posture: good
- Safety-model consistency: weak in important paths
- Durability/restart correctness: mixed
- Maintainability: strained by oversized orchestration functions
- Production confidence: moderate, not high

## What The Project Is

Based on current code, ACC is a personal agent command center for Shayan, not a general SaaS product. It is designed to coordinate internal analysis work plus externally consequential actions through a central tasking layer and operator-facing control surfaces.

In practice, the code implements four overlapping systems:

1. Control plane
- `cloud/server.js`
- `cloud/taskbus/routes.js`
- `cloud/taskbus/router.js`
- `cloud/executor.js`

2. Human interaction surfaces
- Telegram bot and webhook handling
- Web UI and admin endpoints
- Mobile app
- Desktop launcher/monitor shell

3. Execution adapters
- provider fallback chain
- connectors and integrations
- special adapters for marketplace, social publishing, Twilio, billing, browser/code agents

4. Persistence and operational memory
- SQLite task bus store
- Supabase-backed data paths
- ephemeral approval snapshots
- DLQ and watchdog recovery

## What The Project Should Be

From the code itself, ACC should be one coherent thing:

"A human-in-the-loop personal automation system where every external or irreversible action passes through one reliable approval and audit boundary, while internal analysis remains fast and mostly autonomous."

Today, the code only partially achieves that. The system should converge on:
- one approval model,
- one canonical execution path for side-effecting work,
- durable restart-safe approval state,
- strict separation between internal analysis and external action,
- smaller and more testable orchestration modules.

## Strengths

### 1. Backend verification is materially better than average for a repo of this shape
- `npm test` passed with 147/147 tests.
- Covered areas include taskbus routing, auth middleware, billing webhook handling, provider fallback, autonomy loops, queue/worker behavior, WebSocket auth, and several route layers.

### 2. There is a real operational spine, not just route sprawl
- SQLite task persistence in `cloud/taskbus/store.js`
- watchdog and restart recovery
- DLQ handling in worker and graph execution paths
- provider health and status reporting
- WebSocket push for task updates

### 3. The code already contains a usable safety vocabulary
- auth middleware
- approval freshness / replay protection
- action hashing for task approvals
- webhook secret validation
- route scoping between operator/admin/service

The problem is not absence of safety components. The problem is inconsistent application.

### 4. The repo has genuine multi-surface product breadth
- cloud API
- web UI
- Telegram control plane
- mobile shell
- desktop shell
- workflow/connector system

This is a meaningful platform footprint, not a toy repo.

## Findings

### Critical

1. Bypass-agent fallback can skip the approval gate and still reach the generic execution chain.
- Evidence: [cloud/taskbus/router.js](../cloud/taskbus/router.js) lines 138-193 and 259-289.
- `imagegen`, `image`, `tavily`, `hunter`, `alibaba`, and `qwen` are marked as bypass agents.
- If their dedicated connector is unavailable, the code explicitly falls through.
- The later safety gate is guarded by `if (!isBypassAgent && ...)`, so the task keeps bypass status even after falling into generic routing.
- Result: a task classified as "safe utility agent" can degrade into normal provider execution without re-entering approval enforcement.
- Impact: approval semantics can be bypassed for high-risk work if the caller chooses a bypass agent and the specialized connector is not enabled.

2. Graph snapshot approval does not actually pause execution.
- Evidence: [cloud/graphRunner.service.js](../cloud/taskbus/../graphRunner.service.js) lines 191-233 and 287-320.
- `_handleSnapshot()` marks the node as `pendingApproval`.
- Control then returns to `_executeNode()`, which immediately overwrites node status to `completed`, decrements dependencies, and allows downstream nodes to run.
- Result: snapshot approval is informational, not gating.
- Impact: any workflow assuming "sensitive node output must be approved before the graph continues" is incorrect.

### High

3. Snapshot persistence is not restart-safe despite being described as disk-backed.
- Evidence: [cloud/security/ephemeralSnapshots.js](../cloud/security/ephemeralSnapshots.js) lines 8-15 and 43-104.
- Snapshots are written to disk, but there is no boot-time reload from `.ephemeral_store` into memory.
- The live store is only `const store = new Map()`.
- Result: pending approvals disappear from the active process after restart even though files remain on disk.
- Impact: operator approval state is lossy across restart, which is especially bad for a human-in-the-loop product.

4. Several direct external-action routes bypass the central approval/taskbus model.
- Evidence:
  - [cloud/api/phoneRoutes.js](../cloud/api/phoneRoutes.js) lines 65-89
  - [cloud/taskbus/routes.js](../cloud/taskbus/routes.js) lines 129-146
- `POST /api/phone/sms` and `POST /api/phone/call` directly send through Twilio after operator auth.
- `POST /api/taskbus/socialclaw/publish` and `/delete` directly call publishing adapters.
- These routes are authenticated, but they do not flow through the task approval model used elsewhere.
- Impact: the system has two competing safety models:
  - "auth is enough"
  - "external action requires explicit approval"
- That inconsistency weakens the product’s core promise.

5. Core orchestration files are too large and complex to remain trustworthy without refactoring.
- Evidence from graph metrics:
  - `cloud/taskbus/router.routeTask`: complexity 44, cognitive 79
  - `cloud/executor.executeTask`: complexity 37, cognitive 69
  - `cloud/telegram/bot.handleCallback`: complexity 100, cognitive 121
  - `cloud/telegram/bot.handleStateInput`: complexity 40, cognitive 109
- Impact:
  - harder to reason about safety invariants,
  - higher regression risk,
  - expanding test cases becomes more expensive,
  - subtle branch interactions are likely.

### Medium

6. Approval and safety logic is fragmented across multiple partially overlapping systems.
- Evidence:
  - `cloud/taskbus/router.js`
  - `cloud/security/guardrails.js`
  - `cloud/security/policy.js`
  - `cloud/api/securityApproval.js`
  - `cloud/api/uiRoutes.js`
- `guardrails.js` appears to be effectively orphaned while route/task approval logic lives elsewhere.
- Result: there is no single obvious source of truth for "what action is allowed, who can do it, and which approval path applies."
- Impact: future changes are likely to modify one safety layer and forget another.

7. Verification path is not fully dependable on this workstation.
- Evidence:
  - `npm test` passed.
  - `pwsh scripts/verify.ps1` hit a `gitleaks.exe` launch/access error during `secret-scan`.
- Impact: CI/release confidence is lower than the presence of a verify script suggests, because the local verification path is not reliably reproducible.

8. Route and feature breadth significantly exceeds test breadth in high-risk edge surfaces.
- Strong coverage exists for taskbus, auth, billing webhook, provider fallback, worker, and autonomy.
- Coverage is notably weaker or absent for:
  - `cloud/graphRunner.service.js`
  - `cloud/api/phoneRoutes.js`
  - `cloud/api/securityApproval.js`
  - `cloud/api/uiRoutes.js`
  - Telegram webhook/bot state-heavy paths
- Impact: the most stateful and side-effecting paths outside the core taskbus are less protected against regressions.

### Low

9. Repo structure still shows signs of historical layering rather than one clean architecture.
- Examples:
  - old/new orchestration paths coexist,
  - connectors and integrations overlap conceptually,
  - multiple runtime surfaces exist for similar functions.
- This is not immediately fatal, but it increases cognitive load and slows future hardening.

## Aspect-by-Aspect Assessment

### Architecture
- Real architecture is a centralized Node backend with an execution bus and adapter edge.
- The project is broad, but the taskbus is the closest thing to a proper kernel.
- The best long-term move is to make taskbus the only route to side effects.

### Security
- Baseline auth and webhook defenses exist and are better than many repos at this stage.
- Main weakness is not missing crypto; it is inconsistent control application.
- The highest-risk issue is approval bypass through alternate/direct execution paths.

### Reliability
- Good:
  - SQLite persistence for task bus
  - watchdogs
  - DLQ
  - retry behavior
- Weak:
  - graph approval semantics are wrong
  - snapshot state is not restart-safe

### Maintainability
- The repo has too many orchestration concerns concentrated in too few giant files.
- `routeTask`, `executeTask`, and major Telegram handlers should be split by capability and side-effect class.

### Testing
- The backend has real tests and they pass.
- Test posture is a net positive.
- Remaining gap is targeted coverage for graph approval flow and direct side-effect routes.

### Product Fit
- The code clearly aims at a personal automation OS.
- The core product promise should be: "fast internal autonomy, slow external actions behind explicit approval."
- Right now the code is close to that idea, but not consistent enough to claim it with high confidence.

## Prior Audit Comparison

Relative to the 2026-08-01 DeepSeek audits:
- Still true:
  - backend verification depth improved materially,
  - provider fallback and billing webhook behavior are substantially better than before.
- Newly important:
  - approval consistency is now the main control-plane problem,
  - graph approval semantics are not actually enforced,
  - snapshot durability remains weaker than the code comments imply.
- Pre-existing issue still relevant:
  - unauthenticated or alternative side-channel behavior was already a theme in prior reviews; this audit finds the same class of problem now centered on execution-path inconsistency rather than only missing route auth.

## Recommended Next Actions

1. Fix `cloud/taskbus/router.js` so bypass agents only bypass approval when they actually execute through their safe adapter; if they fall through, re-enter the normal safety gate.
2. Fix `cloud/graphRunner.service.js` so `pendingApproval` is terminal for that node until resolution, and downstream dependencies do not unlock early.
3. Rehydrate `cloud/security/ephemeralSnapshots.js` from disk at process boot or move the store to a real persistent table.
4. Route all side-effecting actions through one approval-aware execution path, or explicitly codify and document the small set of exceptions.
5. Add focused tests for:
   - graph snapshot pause/resume semantics,
   - bypass-agent fallback safety,
   - direct Twilio/social publish routes,
   - snapshot restart recovery.
6. Break up:
   - `cloud/taskbus/router.js`
   - `cloud/executor.js`
   - `cloud/telegram/bot.js`

## Verification

Commands run:
- `npm test`
- `pwsh scripts/verify.ps1`
- codebase-memory reindex and graph inspection

Results:
- `npm test`: passed, 147/147.
- `pwsh scripts/verify.ps1`: did not complete cleanly on this machine; `secret-scan` failed because `gitleaks.exe` could not be launched due to access denial.

## Residual Risk

If no code changes are made, the main residual risk is not generic code rot. It is that ACC may appear to enforce human approval more consistently than it actually does under alternative or degraded routing paths.
