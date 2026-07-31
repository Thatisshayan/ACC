# Repo Root Parity Audit — 2026-07-29

Agent: Codex
Scope: Compare the previous (pre-migration) repo root against the current repo root `D:\AgentDevWork\repos\ACC`, identify content present in the old root but absent in the current one, and assess migration risk.
Status: completed

## Sources reviewed
- Current repository rules in `REPO_RULES.md`
- Prior audit: `audits/2026-07-23_Hermes_GovernanceBootstrap_Audit.md`
- Current docs surface: `README.md`, `docs/governance/DEFERRED_WORK.md`
- Filesystem state of both repo roots
- Git-tracked file lists from both repos

## Method
1. Confirmed the current repo root and refreshed the codebase-memory index for `D:\AgentDevWork\repos\ACC`.
2. Compared top-level filesystem entries between the previous and current roots.
3. Compared Git-tracked paths (`git ls-files`) between the previous and current repos to remove noise from `.git`, caches, build outputs, logs, and local temp files.
4. Searched the current repo for references to the missing top-level items to assess whether the missing content is still actively referenced.

## Findings

### 1. Missing top-level items on disk from the previous root
These top-level entries exist under the previous root but do not exist at the current root:

- `.playwright-mcp`
- `.tmp`
- `.vault`
- `AGENT_1_SECURITY_AUTH_BACKEND`
- `AGENT_2_INFRA_DB_VAULT_CLAUDE_CLI`
- `AGENT_3_DASHBOARD_FRONTEND_APP_CLAUDE_CLI`
- `AGENT_4_TELEGRAM_TASKBUS_APPROVALS_CLAUDE_CLI`
- `AGENT_5_INTEGRATIONS_BILLING_AI_FEATURES_CLAUDE-DC`
- `Antigravity`
- a `landing`-named side directory under the previous repo root (local-only, not Git-tracked)

Assessment:
- `.playwright-mcp`, `.tmp`, and `.vault` look environment-specific or runtime-generated.
- `Antigravity` and the `landing`-named side directory were not Git-tracked in the previous repo, so they appear to be local-only artifacts or side directories.
- The five `AGENT_*` folders are the only top-level missing items that contain Git-tracked repository content.

### 2. Git-tracked content missing from the current repo
The previous repo had `599` tracked files. The current repo has `586` tracked files.

There are `26` Git-tracked files present in the previous root that are not tracked in the current root. Every one of them is under one of these five directories:

- `AGENT_1_SECURITY_AUTH_BACKEND` (8 files)
- `AGENT_2_INFRA_DB_VAULT_CLAUDE_CLI` (4 files)
- `AGENT_3_DASHBOARD_FRONTEND_APP_CLAUDE_CLI` (5 files)
- `AGENT_4_TELEGRAM_TASKBUS_APPROVALS_CLAUDE_CLI` (4 files)
- `AGENT_5_INTEGRATIONS_BILLING_AI_FEATURES_CLAUDE-DC` (5 files)

Full missing tracked path list:

- `AGENT_1_SECURITY_AUTH_BACKEND/ACCEPTANCE_CHECKLIST.md`
- `AGENT_1_SECURITY_AUTH_BACKEND/ARCHIVE_ROUTER_NOTE.md`
- `AGENT_1_SECURITY_AUTH_BACKEND/COMPREHENSIVE_PROOF_REPORT_2026-05-31.md`
- `AGENT_1_SECURITY_AUTH_BACKEND/PROMPT_FOR_AGENT.md`
- `AGENT_1_SECURITY_AUTH_BACKEND/README.md`
- `AGENT_1_SECURITY_AUTH_BACKEND/RETENTION_AND_DELETION_GUIDE.md`
- `AGENT_1_SECURITY_AUTH_BACKEND/STATUS_REPORT_2026-05-31.md`
- `AGENT_1_SECURITY_AUTH_BACKEND/TASKS.md`
- `AGENT_2_INFRA_DB_VAULT_CLAUDE_CLI/ACCEPTANCE_CHECKLIST.md`
- `AGENT_2_INFRA_DB_VAULT_CLAUDE_CLI/PROMPT_FOR_AGENT.md`
- `AGENT_2_INFRA_DB_VAULT_CLAUDE_CLI/README.md`
- `AGENT_2_INFRA_DB_VAULT_CLAUDE_CLI/TASKS.md`
- `AGENT_3_DASHBOARD_FRONTEND_APP_CLAUDE_CLI/ACCEPTANCE_CHECKLIST.md`
- `AGENT_3_DASHBOARD_FRONTEND_APP_CLAUDE_CLI/COMPLETION_REPORT.md`
- `AGENT_3_DASHBOARD_FRONTEND_APP_CLAUDE_CLI/PROMPT_FOR_AGENT.md`
- `AGENT_3_DASHBOARD_FRONTEND_APP_CLAUDE_CLI/README.md`
- `AGENT_3_DASHBOARD_FRONTEND_APP_CLAUDE_CLI/TASKS.md`
- `AGENT_4_TELEGRAM_TASKBUS_APPROVALS_CLAUDE_CLI/ACCEPTANCE_CHECKLIST.md`
- `AGENT_4_TELEGRAM_TASKBUS_APPROVALS_CLAUDE_CLI/PROMPT_FOR_AGENT.md`
- `AGENT_4_TELEGRAM_TASKBUS_APPROVALS_CLAUDE_CLI/README.md`
- `AGENT_4_TELEGRAM_TASKBUS_APPROVALS_CLAUDE_CLI/TASKS.md`
- `AGENT_5_INTEGRATIONS_BILLING_AI_FEATURES_CLAUDE-DC/ACCEPTANCE_CHECKLIST.md`
- `AGENT_5_INTEGRATIONS_BILLING_AI_FEATURES_CLAUDE-DC/COMPLETION_REPORT.md`
- `AGENT_5_INTEGRATIONS_BILLING_AI_FEATURES_CLAUDE-DC/PROMPT_FOR_AGENT.md`
- `AGENT_5_INTEGRATIONS_BILLING_AI_FEATURES_CLAUDE-DC/README.md`
- `AGENT_5_INTEGRATIONS_BILLING_AI_FEATURES_CLAUDE-DC/TASKS.md`

### 3. Reference audit
Searches in the current repo found no active references to those missing `AGENT_*` folder paths in the live root surface.

What was found:
- `Antigravity` is referenced in historical archive docs under `docs/archive/`, but not as a required live folder.
- `.vault` appears only as the expected runtime vault path inside `cloud/security/vaultStub.js`, not as a missing project folder dependency at the repo root.

Assessment:
- The missing `AGENT_*` folders appear to be legacy planning, handoff, acceptance, and completion packets rather than live application runtime dependencies.
- Operational risk to the running codebase appears low.
- Documentation/history retention risk is moderate because these files were previously tracked and are now absent from the migrated root.

## Audit conclusion
- Current repo parity is not exact.
- The gap is narrow and well-scoped: `26` tracked legacy documentation files under five `AGENT_*` folders are absent from the current root.
- I found no evidence that the current runtime or active docs depend on those paths.
- If full historical parity matters, those folders should be restored, archived intentionally, or explicitly declared obsolete.

## Deferred work recorded
- Added a deferred-work entry to `docs/governance/DEFERRED_WORK.md` so the migration gap is recorded outside chat.

## Verification
- Refreshed codebase-memory index for `D:\AgentDevWork\repos\ACC`
- Compared top-level filesystem entries between the old and current roots
- Compared Git-tracked files with:
  - `git -c safe.directory=<previous-repo-root> -C <previous-repo-root> ls-files`
  - `git -C D:/AgentDevWork/repos/ACC ls-files`
- Searched current repo references with `rg`

## Residual risk
- This audit did not diff file contents for paths that exist in both repos; it only identifies items present in the old root and absent in the current root.
- The old repo contained many untracked local artifacts; those were not treated as authoritative repository content unless they were also Git-tracked.
