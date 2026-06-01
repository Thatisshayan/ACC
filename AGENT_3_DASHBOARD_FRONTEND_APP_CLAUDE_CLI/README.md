# Agent 3 — Dashboard / Frontend App

## Mission

Make /app real, usable, and connected to backend truth. Turn the dashboard from shell/demo into operational command UI.

## Owns

- `ui/src/*`
- `ui/dist build process coordination`
- `landing/auth-check.html redirect only if coordinated with Agent 6`
- dashboard routes
- `dashboard API client/hooks`
- dashboard WebSocket client
- `frontend empty/error/loading states`

## Do not touch without coordination

- `cloud/server.js except documenting expected frontend route behavior`
- `cloud/taskbus/*`
- `cloud/telegram/*`
- `migrations/*`

## Start now

- Build React dashboard and confirm /app loads
- Fix auth redirect to /app
- Add route guard
- Add pages: Dashboard, Assistant, Tasks, Approvals, Messenger, Admin, Audit, Billing, Settings
- Wire connector health/task status/approval queue
- Add WebSocket task updates with polling fallback

## Merge gate

- [ ] /app loads after login
- [ ] Refreshing /app/inner-route does not 404
- [ ] Approval buttons call hardened endpoints
- [ ] Dashboard shows real or explicitly empty data, never fake data
- [ ] Build succeeds locally and in deploy pipeline

## Assigned task count

- Total rows assigned from master list: **54**
- Priority counts: `{'P3': 24, 'P2': 18, 'P0': 9, 'P1': 3}`
- Phase counts: `{'10 Mobile Desktop Comms': 11, '1 App Loading and Core Verify': 9, '8 Media': 8, '5 Billing and Access': 8, '7 Jobs': 7, '6 Outreach': 7, '3 Env and Core Activation': 1, '9 Dashboard Admin UX': 1, '11 Reliability Observability': 1, '13 Compliance Launch': 1}`

## Working rule

Keep changes small, testable, and reversible. Do not mark anything complete unless you can show the command, endpoint response, test, or screenshot proving it.
