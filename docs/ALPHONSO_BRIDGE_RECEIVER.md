# Alphonso Bridge Receiver

ACC exposes a dedicated receiver for Alphonso content-catalyst packets at:

- `POST /api/alphonso-bridge`
- `GET /api/alphonso-bridge/status`
- `GET /api/alphonso-bridge/packets`

## Authentication

ACC expects the shared token in:

- `ALPHONSO_BRIDGE_TOKEN`

Alphonso should send it as:

```http
Authorization: Bearer <ALPHONSO_BRIDGE_TOKEN>
```

If the token is missing on the ACC side, the bridge reports `setup_required`.

Optional smoke-test override:

- `ALPHONSO_BRIDGE_DATA_DIR`

This lets you point the packet journal at a temporary folder during local verification.

## Packet Types

ACC currently accepts:

- `content_job`
- `task`
- `result`
- `approval`
- `memory`

## Content Job Mapping

`content_job` packets are normalized into the Task Bus so ACC can:

- track the job as a task
- create a publish approval when needed
- record final results when the job is published or failed
- keep a local packet journal for traceability

## Truth Labels

The bridge is intentionally honest:

- `setup_required` when the shared token is not configured
- `unauthorized` when the bearer token is wrong
- `recorded` when the packet was accepted and stored

## Operator Status

The receiver status endpoint reports:

- whether the token is configured
- the path prefix
- packet count
- the most recent packet kind
- the most recent error if one exists
