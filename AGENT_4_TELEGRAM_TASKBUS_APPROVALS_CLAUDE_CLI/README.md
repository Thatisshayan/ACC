# Agent 4 — Telegram / Approvals / Taskbus Operations

## Mission

Make ACC’s human-in-the-loop control plane reliable: Telegram commands, task lifecycle, approvals, retries, failures, and operator safety.

## Owns

- `cloud/telegram/*`
- `cloud/taskbus/*`
- `cloud/orchestrator/* task lifecycle contracts`
- approval lifecycle implementation
- worker behavior
- `DLQ/retry/kill switch/dry-run mode`

## Do not touch without coordination

- `cloud/server.js auth mounting without Agent 1`
- `migrations/* schema changes without Agent 2`
- `ui/src/* except API contract docs`
- `cloud/connectors/* provider internals`

## Start now

- Register/verify Telegram webhook
- Fix Telegram button/callback handling
- Bind approvals to task ID, user ID, timestamp, action hash, HMAC signature, TTL
- Implement task states
- Add retry/failure notifications
- Add kill switch and dry-run mode
- Add DLQ handling

## Merge gate

- [ ] Approve/reject works from Telegram and dashboard against same source of truth
- [ ] Expired approval cannot be used
- [ ] Modified action payload invalidates approval
- [ ] Task lifecycle is visible and deterministic
- [ ] Failed post-approval actions notify operator and can be retried safely

## Assigned task count

- Total rows assigned from master list: **50**
- Priority counts: `{'P2': 30, 'P3': 8, 'P1': 7, 'P0': 5}`
- Phase counts: `{'11 Reliability Observability': 30, '6 Outreach': 4, '3 Env and Core Activation': 4, '8 Media': 3, '13 Compliance Launch': 3, '1 App Loading and Core Verify': 2, '0 Emergency Lockdown': 2, '7 Jobs': 2}`

## Working rule

Keep changes small, testable, and reversible. Do not mark anything complete unless you can show the command, endpoint response, test, or screenshot proving it.
