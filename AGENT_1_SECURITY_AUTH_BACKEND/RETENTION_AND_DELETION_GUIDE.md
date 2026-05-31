# ACC Backend Retention and Deletion Guide (Agent 1)

## Purpose
Defines the backend-safe data lifecycle controls currently implemented for Agent 1 security/auth scope.

## Implemented Endpoints

### 1) Export memory data
- Route: `GET /api/memory/export?scope=<scope>`
- Auth: protected by backend auth middleware (`operator/admin`).
- Behavior: returns all rows in the selected memory scope with `exportedAt` timestamp.

### 2) Account/scope deletion
- Route: `POST /api/memory/account-delete`
- Body:
  - `scope` (required)
  - `confirm: true` (required)
- Auth: protected by backend auth middleware (`operator/admin`).
- Behavior: deletes all memory rows for the provided scope; returns deleted row count.

### 3) Retention prune
- Route: `POST /api/memory/retention/prune`
- Auth: protected by backend auth middleware (`operator/admin`).
- Behavior: deletes expired memory rows (`expires_at <= now`), returns deleted count.

## Operational Notes
- Set `expires_at` on write paths when short-lived memory is desired.
- Run prune endpoint from an internal scheduler for recurring cleanup.
- Deletion is scope-based; scope naming should be deterministic (e.g., `user:<id>`).

## Security Notes
- These endpoints are not public.
- No raw secrets are emitted by endpoint responses.
- Deletion requires explicit `confirm=true` to avoid accidental destructive calls.
