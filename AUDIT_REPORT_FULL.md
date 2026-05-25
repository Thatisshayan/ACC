# ACC v2 Full System Audit Report
# 2026-05-24

## Executive Summary

ACC v2 is in a strong but not finished state. The core backend, Task Bus, Telegram command layer, lead-collector workflow, and UI all exist and are wired together well enough to support real execution. The UI production build now passes locally through the repo build harness, and the monitoring/audit surfaces have been tightened to avoid misleading checks and secret previews.

The main remaining work is not “build the whole app again.” It is mostly completion work:
- finish the last verification gaps
- keep the workflow ecosystem consistent across multiple agents and workflows
- make monitoring truthful
- make the audit/reporting layer safe and current
- ensure the new workflow branches can run side by side without breaking the existing ones

## Current Status

Confirmed locally:
- Backend server routes are present and syntactically valid.
- Task Bus APIs are present and functioning at the code level.
- Telegram bot and command routing are implemented.
- Lead-collector / outreach CRM workflow exists and is integrated into the Task Bus.
- ClickUp connector now matches the connector registry pattern.
- `ui` production build passes through the repo build harness.
- Monitoring now checks an existing admin/system surface instead of a dead Telegram status route.
- Audit logging has been redacted to stop leaking env previews.

Still incomplete or risky:
- The legacy direct Vite config path remains a risk if someone invokes `vite build` manually instead of the repo build harness.
- Runtime end-to-end validation is still needed for several paths.
- The project has a dirty worktree with in-flight changes, so scope discipline still matters.

## Detailed Findings

### 1. Backend / API

Confirmed:
- `cloud/server.js` exposes the backend API, task execution route, Task Bus mount, admin routes, and UI routes.
- `cloud/api/uiRoutes.js` provides dashboard, snapshots, approvals, and secrets endpoints.
- `cloud/admin/api.js` provides admin/system, logs, connectors, approvals, and audit routes.

Risk:
- Several “truth” endpoints are still only verified at the code level, not fully exercised end to end.

### 2. Task Bus

Confirmed:
- Task creation, task retrieval, results, approvals, stats, and router dispatch are present.
- The Task Bus has approval gating and high-risk routing controls.
- Lead collector tasks are being created as a distinct workflow role.

Issue fixed in this pass:
- The UI Task Bus hook no longer shadows browser `fetch`.

Remaining work:
- Full task lifecycle testing still needs to be run after the next workflow import and integration pass.

### 3. Connectors

Confirmed:
- Connector registry loads class-based connectors from the manifest.
- ClickUp is now implemented as a class-based connector, matching the registry pattern.

Issue fixed in this pass:
- The old ClickUp function export mismatch is resolved.

Risk:
- Connector health should still be exercised against live credentials where appropriate.

### 4. Monitoring / Audit

Confirmed:
- `acc-monitor.js` now checks `http://localhost:4000/admin/system` instead of a non-existent Telegram status route.
- The monitor reports active bot and worker state from the admin/system payload.
- `audit.js` no longer prints secret previews.

Risk:
- Monitoring should still be treated as advisory until it is run in the same environment as the live services.

### 5. UI

Confirmed:
- The production build now passes locally with `ui/build.cjs`.
- The build output is generated successfully under `ui/dist`.

Issue fixed in this pass:
- The build is no longer blocked by the Vite config loading path.

Residual risk:
- The direct legacy `vite build` config path is still not the preferred entrypoint.

### 6. Lead Collector / Outreach CRM

Confirmed:
- The workflow exists in `cloud/workflows/accOutreachCrmModule.js`.
- The poller exists in `cloud/workflows/leadCollectorPoller.js`.
- Dedupe, scoring, task creation, and sink mirroring are implemented.
- Lead-collector env vars are now documented in `.env.example`.

Risk:
- This workflow still needs a real end-to-end run against actual input data.

### 7. Docs / Truth Maintenance

Confirmed:
- The old audit report was stale and has been replaced with a current, redacted version.
- The env template is now closer to the live workflow surface.

Risk:
- Any future workflow import should come with matching docs so the repo does not drift again.

## What Matters Most

### To make UI reach 100%
1. Keep the build harness as the default build path.
2. Verify the built app in the desktop and browser launch paths.
3. Remove or align the legacy Vite config path so direct invocations do not surprise future maintainers.

### To make Task Bus reach 100%
1. Verify create -> route -> approval -> result -> stats end to end.
2. Validate the new lead-collector role in the live flow.
3. Confirm task approvals still resolve correctly through Telegram and admin surfaces.

### To make Connectors reach 100%
1. Verify ClickUp health and sync behavior.
2. Confirm registry loading for all manifest entries.
3. Exercise one live connector path per provider group.

### To make Monitoring reach 100%
1. Run the monitor in the same environment as the live backend.
2. Add one more check for Task Bus health if needed.
3. Keep the output truth-based and secret-safe.

### To make Audit / Docs reach 100%
1. Keep audit output redacted.
2. Regenerate the audit report whenever the workflow surface changes.
3. Update env and workflow docs together, not separately.

## 100% Completion Plan

### A. Platform stability
1. Keep `npm run build` green.
2. Run a backend health check against `/api/health`.
3. Run an admin/system check against `/admin/system`.

### B. Task orchestration
1. Validate the lead-collector workflow with a real CSV or test dataset.
2. Validate a normal Task Bus task from creation to completion.
3. Validate an approval-required task from creation to resolution.

### C. Workflow ecosystem
1. Import the updated job-application workflow beside the existing one.
2. Add a registry or trigger layer for multiple workflows.
3. Confirm the workflows can run side by side without overwriting each other.

### D. UI and operator experience
1. Confirm the dashboard reads the right task and system data.
2. Confirm approvals are visible and actionable.
3. Confirm the operator can tell at a glance what is online, starting, offline, or failed.

### E. Safety and truth
1. Keep audit output secret-safe.
2. Keep monitoring based on real endpoints.
3. Avoid claiming completion until runtime verification is done.

## Final Verdict

ACC v2 is functional enough to keep building on, but it is not yet “100% complete.”

The best next move is to continue with runtime verification and workflow import, using the now-green build path as the baseline.
