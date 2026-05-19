# Codex Instruction — Complete Alphonso P0 and P1

## Context
You are continuing work on Alphonso, a Tauri v2 desktop AI agent ecosystem.
**READ THIS FIRST before touching any files.**

Project path: `C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2`
Stack: Tauri v2 (Rust) + React + Vite + Tailwind CSS
Tests: `npm run test` (vitest, 6 files, 11 tests — must remain passing)
Build: `npx tauri build` (must remain working)

## CRITICAL RULES
- DO NOT delete any files
- DO NOT change any working UI components
- DO NOT break the existing build
- Run `npm run test` before and after every change
- Make small focused changes, one P0 item at a time
- If unsure, read the file first, then ask

## Files to read first (in order)
1. `docs/ALPHONSO_FULL_TRUTH_REPORT_2026-05-13.md` — full truth state
2. `src/services/joseCommandRouterService.js` — orchestrator
3. `src/services/joseExecutionEngineService.js` — execution engine
4. `src/services/durableMemoryService.js` — SQLite memory
5. `src-tauri/src/main.rs` — Rust backend commands

## P0 Items (implement in this order)

### P0-1: Jose orchestration durability
File: `src/services/joseExecutionEngineService.js`
Add retry logic for failed tasks:
- Max 3 retries with exponential backoff (1s, 2s, 4s)
- After 3 failures: move to dead-letter queue (DLQ array in memory + SQLite)
- DLQ entry: { taskId, instruction, error, attempts, timestamp }
- Add `getDLQ()` and `retryDLQ(taskId)` exports

### P0-2: Full approval enforcement
File: `src/services/orchestrationGovernanceService.js`
Ensure every external action (send message, upload, post, delete) calls `requireApproval()` before executing.
Audit: search for `connector` calls that don't have `await requireApproval()` before them.
Add missing approval gates.

### P0-3: WhatsApp Cloud inbound webhook
File: `src/services/` — create `whatsappWebhookService.js`
WhatsApp Cloud API sends POST to a webhook URL.
Implement:
- `verifyWebhook(token, challenge)` — GET handler for verification
- `processInbound(body)` — POST handler for messages
- Export both handlers for use in Tauri HTTP server

### P0-4: Connector auth hardening
File: `src/services/connectorRegistryService.js`
Add for each connector:
- `isAuthenticated()` check before any action
- Log rejected requests: `{ connector, action, reason: 'not_authenticated', timestamp }`
- Return structured error: `{ success: false, error: 'not_authenticated', connector }`

## P1 Items (after P0 is done)

### P1-1: Hector provider failover
File: `src/services/hectorResearchService.js`
Add fallback chain: primary provider → secondary provider → local Ollama
If primary fails, try secondary. Log which provider was used.

### P1-2: Miya ComfyUI workflow templates
File: `src/services/` — create `miyaWorkflowTemplates.js`
Add 3 template objects: text-to-image, img-to-img, video-from-image
Each template: `{ name, workflow_json_template, required_inputs, description }`

### P1-3: Trust/receipt browser
File: `src/components/` — create `TrustReceiptBrowser.jsx`
Simple React component showing list of trust receipts from SQLite
Columns: timestamp, agent, action, status, proof_hash
Filter by agent and status

## Verification for each item
After each P0 item:
1. `npm run test` — must pass
2. `npm run build` — must succeed  
3. Check no console errors

## How to run
```bash
cd "C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2"
npm run test
npm run dev
```

Start with P0-1 only. Report when done before moving to P0-2.
