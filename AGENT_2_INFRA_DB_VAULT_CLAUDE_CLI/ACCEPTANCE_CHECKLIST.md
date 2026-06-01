# Agent 2 — Infrastructure / Env / Vault / Database — Acceptance Checklist

## Required before merge

- [ ] NODE_ENV=production fails startup when critical secrets are missing
- [ ] Vault never writes plaintext in production
- [ ] Migrations are repeatable and documented
- [ ] RLS prevents cross-user task/memory reads
- [ ] Webhook secrets missing in production cause hard failure/rejection

## Evidence to provide

- [ ] Files changed list
- [ ] Commands run
- [ ] Test output or endpoint response
- [ ] Known limitations
- [ ] Rollback notes
