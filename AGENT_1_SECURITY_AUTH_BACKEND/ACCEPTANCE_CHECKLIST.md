# Agent 1 — Security / Auth / Backend Lockdown — Acceptance Checklist

## Required before merge

- [ ] Anonymous request to every sensitive route returns 401
- [ ] No production setup/debug endpoint exposes internals
- [ ] Approval mutation cannot be completed by just sending approver=Shayan
- [ ] Auth middleware fails closed in NODE_ENV=production
- [ ] No secret values are printed in logs

## Evidence to provide

- [ ] Files changed list
- [ ] Commands run
- [ ] Test output or endpoint response
- [ ] Known limitations
- [ ] Rollback notes
