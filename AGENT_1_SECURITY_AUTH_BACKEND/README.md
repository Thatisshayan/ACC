# Agent 1 — Security / Auth / Backend Lockdown

## Mission

Stop ACC from being dangerous in public. Lock all sensitive, expensive, financial, admin, memory, task, and approval mutation surfaces before public launch.

## Owns

- `cloud/server.js`
- `cloud/middleware/*`
- `cloud/api/* route mounting auth`
- `/api/execute`
- `/api/taskbus/* auth boundary`
- `/api/card/* auth boundary`
- `/api/outreach/* auth boundary`
- `/api/memory/* auth boundary`
- `/api/synapse/* auth boundary`
- `/admin/*`
- `/api/admin/*`
- `/api/ui/* mutation protection`

## Do not touch without coordination

- `ui/src/* except API auth assumptions in docs`
- `migrations/* unless coordinating with Agent 2`
- `cloud/telegram/* unless approval endpoint contract requires it`
- `landing/*`

## Start now

- Create reusable auth middleware
- Protect sensitive routes
- Remove/protect setup/debug endpoints
- Replace spoofed approver trust at backend boundary
- Add route-level 401 tests or hand to QA

## Merge gate

- [ ] Anonymous request to every sensitive route returns 401
- [ ] No production setup/debug endpoint exposes internals
- [ ] Approval mutation cannot be completed by just sending approver=Shayan
- [ ] Auth middleware fails closed in NODE_ENV=production
- [ ] No secret values are printed in logs

## Assigned task count

- Total rows assigned from master list: **89**
- Priority counts: `{'P2': 31, 'P0': 25, 'P1': 22, 'P3': 11}`
- Phase counts: `{'9 Dashboard Admin UX': 30, '2 Database Auth Migrations': 27, '0 Emergency Lockdown': 21, '1 App Loading and Core Verify': 4, '10 Mobile Desktop Comms': 2, '12 Cleanup Docs': 2, '8 Media': 1, '11 Reliability Observability': 1, '13 Compliance Launch': 1}`

## Working rule

Keep changes small, testable, and reversible. Do not mark anything complete unless you can show the command, endpoint response, test, or screenshot proving it.
