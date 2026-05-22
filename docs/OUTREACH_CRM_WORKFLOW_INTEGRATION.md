# ACC Outreach/CRM Workflow Integration

## What this module does
- Imports leads from Google Sheets (CSV export URL).
- Creates approval-gated TaskBus tasks (outreach/CRM subset only).
- Optionally mirrors leads to Airtable or ClickUp.
- Emits observability metadata:
  - `request_id`
  - per-run `receipt`
  - `failure_class` on failures/partial failures

## Implemented files
- `cloud/workflows/accOutreachCrmModule.js`
- `cloud/taskbus/routes.js`
- `cloud/taskbus/store.js` (extended metadata support)

## Required env vars
- `GOOGLE_SHEETS_LEADS_CSV_URL` (public or service-proxied CSV URL)
- `AIRTABLE_API_KEY` (optional, for sink `airtable` or `both`)
- `AIRTABLE_BASE_ID` (optional, for sink `airtable` or `both`)
- `AIRTABLE_LEADS_TABLE` (optional, default `Leads`)
- `CLICKUP_API_KEY` (optional, for sink `clickup` or `both`)
- `CLICKUP_LEADS_LIST_ID` (optional, required when sink includes clickup)

## Endpoints

## 1) Health
`GET /api/taskbus/workflow/outreach-crm/health`

Returns module readiness (Google Sheets configured, Airtable/ClickUp enabled, list configured).

## 2) Bootstrap leads to TaskBus (+ optional sink mirror)
`POST /api/taskbus/workflow/outreach-crm/bootstrap`

Body:
```json
{
  "sheetCsvUrl": "https://docs.google.com/spreadsheets/d/.../export?format=csv",
  "maxLeads": 50,
  "sink": "airtable",
  "createdBy": "chatgpt"
}
```

`sink` options:
- `none`
- `airtable`
- `clickup`
- `both`

Response includes:
- `request_id`
- created `task_ids`
- run `receipt` (counts, mirror status, failures)

## Example cURL
```bash
curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/bootstrap ^
  -H "Content-Type: application/json" ^
  -H "x-request-id: req-outreach-001" ^
  -d "{\"maxLeads\":25,\"sink\":\"both\"}"
```

## Policy behavior
- Created tasks are `approval_required: true`
- Outbound messaging should only happen after explicit approval resolution.

## Notes
- This module intentionally activates only outreach/CRM subset.
- It does not merge CrewAI package into core runtime; it wraps tasks through ACC TaskBus.
