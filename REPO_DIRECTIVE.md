# ACC (Agent Command Center) — REPO_DIRECTIVE

> Goal-layer constitution. `REPO_RULES.md` is the law; this is the mission. Every
> task MUST carry `traces-to:` to a Phase/Sprint/Epic. Orphan tasks rejected by CI
> (scripts/verify.sh → directive-lint) and by Sentinel.

## Vision

ACC is a personal AI orchestration system that runs autonomous agents for Shayan:
job search/apply, marketplace posting, outreach, landing-page deploy, SEO media
production, legal-evidence intake with PII redaction, email monitoring, and an
AI chat assistant — all behind human-in-the-loop approval via Telegram and a web UI.
North-star: maximum personal leverage with zero unauthorized external action
(no post, apply, pay, or send without explicit approval or a locked allow-list).

## Non-Goals

- NOT an autonomous agent that acts externally without approval (human-in-the-loop is core).
- NOT a multi-tenant SaaS; single-owner personal system.
- NOT using Facebook Marketplace connector (disabled by default, keep off).
- NOT storing plaintext credentials; secrets via vault + .env (gitignored).
- NOT replacing the Telegram bot as primary control surface.

## Phases

### P1 — Stability & Truth (CURRENT)
  exit criteria: README accurate (marked stale); START_DASHBOARD.bat works; smokeRuntime green.
### P2 — Connector Hardening
  exit criteria: every enabled connector has rate-limit + error handling + tests.
### P3 — Approval Surface
  exit criteria: Telegram + web UI approval parity; no action without traceable approve.

## Sprints

### S1 (maps to P1) — fix the stale README + runtime
  goal: docs reflect real structure; supervisor starts clean on Windows.
### S2 (maps to P2) — connector safety
  goal: graphRunner DLQ + per-connector rate limits verified.

## Epics / Chapters

### E1 — Orchestration Core (maps to P1/P2)
  agentRouter / connectorRouter / graphRunner reliable, retry+DLQ.
### E2 — Human-in-the-Loop (maps to P2/P3)
  every external action gated by approval or allow-list.
### E3 — Connectors (maps to P2)
  20+ integrations safe, rate-limited, tested.

## Tasks

- [ ] T1 — Rewrite README to match actual structure (current marked "WE BACK, will update") | traces-to: P1/S1/E1 | acceptance: README structure matches repo; no false claims
- [ ] T2 — Verify graphRunner.service.js retry + DLQ with a failing connector test | traces-to: P2/S2/E1 | acceptance: failed task lands in DLQ, not lost
- [ ] T3 — Add rate-limit + error wrapper to all enabled connectors (kijiji, gmail, linkedin, indeed, etc.) | traces-to: P2/S2/E3 | acceptance: each connector handles 429/timeout gracefully
- [ ] T4 — Ensure Telegram approval and web UI approval use same allow-list source | traces-to: P3/S2/E2 | acceptance: approving in one surface reflects in the other
- [ ] T5 — Confirm marketplace/facebookMarketplace.js stays disabled + untested in CI | traces-to: P1/S1/E3 | acceptance: CI never enables Facebook connector

## Sentinel Constraints

- auto-approve: docs, tests, lint, non-external logic tracing to P1/E1.
- review-required: connectors that send externally, vault, approval flow, Telegram/webhook.
- locked: `main`; `data/` user state; any connector that posts/applies/pays; secrets.
