# Optional Agent 7 — QA / Test / Release Gate

## Mission

Break ACC before users do. This agent is optional; if skipped, distribute these checks across Agents 1, 2, and 4.

## Owns

- `tests/*`
- `scripts/smokeTest.js`
- CI workflow quality gates
- security regression tests
- release checklist
- manual QA checklist

## Do not touch without coordination

- implementation files except tiny testability hooks approved by owners

## Start now

- Anonymous access tests
- Approval spoofing tests
- Missing vault key production test
- Task execute auth test
- Stripe webhook signature test
- Telegram webhook secret test
- Secret scanning
- Dependency audit
- Smoke test truth check

## Merge gate

- [ ] Security tests fail before fixes and pass after fixes
- [ ] Smoke test count matches landing/docs claims
- [ ] Deploy is blocked on failing P0 tests
- [ ] Release checklist is completed before public launch

## Assigned task count

- Total rows assigned from master list: **40**
- Priority counts: `{'P2': 15, 'P1': 13, 'P0': 9, 'P3': 3}`
- Phase counts: `{'1 App Loading and Core Verify': 12, '13 Compliance Launch': 8, '0 Emergency Lockdown': 4, '2 Database Auth Migrations': 4, '4 AI Provider Chain': 3, '10 Mobile Desktop Comms': 2, '8 Media': 2, '12 Cleanup Docs': 2, '5 Billing and Access': 1, '7 Jobs': 1, '11 Reliability Observability': 1}`

## Working rule

Keep changes small, testable, and reversible. Do not mark anything complete unless you can show the command, endpoint response, test, or screenshot proving it.
