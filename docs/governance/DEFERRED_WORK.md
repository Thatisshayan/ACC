# Deferred Work Register

Rule 12 / Rule 11. This register survives the session. Future agents resume from here.

## Format
- `[DATE] <scope>: <what> — <why deferred> — <resume hint> — <status>`

## Items
- `[2026-07-29] repo-root-parity: 26 git-tracked legacy files from the previous root (C:\Users\Shaya\agent-command-center) are not present in the current root (D:\AgentDevWork\repos\ACC), all inside five AGENT_* handoff/report folders — deferred because this session was scoped to audit/reporting rather than migration; if parity is required, recover or intentionally archive those folders and update docs to mark the decision — open`
- `[2026-08-01] cloud/queue.js: enqueueTask has no input validation — a missing agentType/payload silently creates a queued task that the worker will run with undefined fields. Found while writing cloud/queue.test.js (Task E); the handoff scoped that file to the modules that exist, not new behavior. Resume hint: add early-return validation in enqueueTask and test it. — open`
- `[2026-08-01] scripts/verify.ps1 (Windows): npm ci stage runs close to the 300s RunTimed budget on slow local machines (~7 min here) and can be killed mid-install, cascading into a failed deploy-dry (node_modules incomplete). The install itself succeeds and CI runners stay within budget. Resume hint: if local verify runs matter on Windows, make the npm-ci timeout configurable (e.g. $env:VERIFY_NPM_CI_TIMEOUT) without loosening the CI default. — open`
- `[2026-08-01] secret-scan: local runtime artifact data/messages/messenger.key (gitignored via data/messages/, untracked) is flagged by the file-based .key scan. Clean CI checkouts are unaffected. Resume hint: consider excluding data/ runtime dirs from the filename scan, or documenting that the file must be deleted after local runs. — open`
