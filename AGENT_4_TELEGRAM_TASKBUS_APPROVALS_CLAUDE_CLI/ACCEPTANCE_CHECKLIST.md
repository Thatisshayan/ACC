# Agent 4 — Telegram / Approvals / Taskbus Operations — Acceptance Checklist

## Required before merge

- [ ] Approve/reject works from Telegram and dashboard against same source of truth
- [ ] Expired approval cannot be used
- [ ] Modified action payload invalidates approval
- [ ] Task lifecycle is visible and deterministic
- [ ] Failed post-approval actions notify operator and can be retried safely

## Evidence to provide

- [ ] Files changed list
- [ ] Commands run
- [ ] Test output or endpoint response
- [ ] Known limitations
- [ ] Rollback notes
