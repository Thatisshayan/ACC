# ACC Build Plan: The Remaining 70%

## Context

The audit revealed that the ACC codebase is architecturally solid — the routes exist, the connectors exist, the approval flow works, and the task bus is real. The actual gap is smaller than "70% unbuilt" but more specific:

1. **Env vars are missing** — Stripe price IDs, Privacy.com key, Twilio creds, DeepSeek key. These block features that are already coded.
2. **Landing page claims don't match reality** — GPT-4o and Gemini are advertised but not in the provider chain. Job search and media pipeline are advertised but not verified end-to-end.
3. **Three features are genuinely unbuilt** — GPT-4o/Gemini provider connectors, job search (Playwright browser automation), media pipeline (ElevenLabs, Runway).
4. **Silent failures** — `safeRequire` may be swallowing load errors; Claude credits depleted and filtered out.

The plan is ordered: fix what's broken → add real AI providers → wire billing → verify existing features → build the missing three features → fix the landing page.

---

## Phase 1: Fix Silent Failures + Missing Env Vars (Day 1–2)

**Goal:** Make every already-coded feature actually work. No new features — just unblock what exists.

### 1A. Expose safeRequire failures
**File:** `cloud/server.js` (lines 268–271 where safeRequire is called)
- Replace `safeRequire` with direct `require()` for all four routes: `billingRoutes`, `cardRoutes`, `phoneRoutes`, `memoryRoutes`
- If a route fails to load, log the actual error and crash loudly rather than silently skipping
- **Test:** Restart the server and confirm all four route groups appear in startup logs

### 1B. Add missing env vars to Railway
Add these in Railway → Variables:
- `STRIPE_PRICE_STARTER` — from Stripe dashboard (create if not exists)
- `STRIPE_PRICE_BUILDER` — from Stripe dashboard
- `STRIPE_PRICE_OPERATOR` — from Stripe dashboard
- `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard → Webhooks
- `DEEPSEEK_API_KEY` — from DeepSeek console
- `PRIVACY_API_KEY` — from Privacy.com developer settings
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — from Twilio console
- `RESEND_API_KEY` — from Resend dashboard
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API

### 1C. Run Supabase table migrations
**File:** `ACTIVATION.md` Step 1 — run the SQL schema on the new Supabase project
- Confirm tables exist: `waitlist`, `memory`, `subscriptions`, `audit_log`
- Test: `POST /api/waitlist` with test email → confirm row appears in Supabase

### 1D. Fix hardcoded approval identity
**File:** `cloud/api/securityApproval.js` (line 48 area)
- Replace hardcoded `approver: 'Shayan'` with `req.user?.email || 'unknown'` resolved from the Supabase JWT
- **Test:** Approve a task from the dashboard → confirm approval record shows the correct email

---

## Phase 2: Add Real AI Providers (Day 3–4)

**Goal:** The landing page claims Claude, GPT-4o, Gemini, DeepSeek. Right now only DeepSeek works. Fix this or fix the landing page.

### 2A. Add OpenAI (GPT-4o) to provider chain
**New file:** `cloud/connectors/openai.js`
- Pattern: match existing `cloud/connectors/deepseek.js` exactly
- POST to `https://api.openai.com/v1/chat/completions` with model `gpt-4o`
- Requires `OPENAI_API_KEY` env var
- Returns `{ success, output, provider: 'openai', model: 'gpt-4o' }`

**Modify:** `cloud/taskbus/providerFallback.js`
- Add `'openai'` to the provider order: `deepseek, openai, ollama, alibaba, smart_stub`
- Add case for `'openai'` in the provider switch that calls `openai.query(task)`

**Railway:** Add `OPENAI_API_KEY`

### 2B. Add Gemini to provider chain
**New file:** `cloud/connectors/gemini.js`
- POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`
- Requires `GEMINI_API_KEY` env var
- Returns `{ success, output, provider: 'gemini', model: 'gemini-pro' }`
- Add to provider order: `deepseek, openai, gemini, ollama, alibaba, smart_stub`
- **Railway:** Add `GEMINI_API_KEY`

### 2C. Claude — replenish or remove
- If credits will be replenished: Re-add `'claude'` to provider chain in `providerFallback.js` line 20 (remove the filter)
- If not: Remove Claude from all landing page copy. The Smart Stub is honest — that's fine.

---

## Phase 3: Stripe Billing End-to-End (Day 4–5)

**Goal:** A user can click "Apply" → onboard → reach a checkout page → pay → get access.

### 3A. Verify checkout session creation works
**File:** `cloud/api/billingRoutes.js` (line 102)
- The code is there. Test: `POST /api/billing/checkout { email, plan: 'starter' }` → should return `{ url: 'https://checkout.stripe.com/...' }`
- Fix: confirm `STRIPE_PRICE_STARTER` resolves correctly

### 3B. Wire webhook handling
**File:** `cloud/api/billingRoutes.js` (line 129–183)
- Confirm Railway has `STRIPE_WEBHOOK_SECRET`
- Register webhook in Stripe dashboard: `https://acccommand.center/api/billing/webhook` for events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Test with Stripe CLI: `stripe listen --forward-to acccommand.center/api/billing/webhook`

### 3C. Connect billing tier to feature access
**File:** `cloud/api/billingRoutes.js` exports `getTier(email)`
- Use `getTier()` in the taskbus router to enforce plan limits (task count, agent access)
- Add billing status card to dashboard Settings page

---

## Phase 4: Verify & Fix Existing Core Features (Day 5–7)

These are coded and have real API calls. They just need to be tested end-to-end with real keys and any small bugs fixed.

### 4A. Email sending (Resend)
**Flow:** Task with `assigned_agent: 'resend'` → `router.js` lines 158–205 → approval → `resend.sendTaskFromACC()` → `axios.post()` to Resend API
- **Test:** Create an email task in the dashboard, approve it in Telegram, confirm email arrives
- **Fix:** Confirm `RESEND_API_KEY` and `FROM` address set; Resend requires verified domain

### 4B. Privacy.com agent cards
**Flow:** `POST /api/card/request` → Telegram approval → `POST /api/card/approve/:id` → `createCard()` in `privacyCard.js`
- **Test:** Request a card via API, approve via Telegram, confirm card created in Privacy.com dashboard
- **Fix:** `PRIVACY_API_KEY` must be set; confirm sandbox vs live mode

### 4C. Twilio SMS + calls
**Flow:** `POST /api/phone/sms { to, body }` → `twilio.sendSMS()` → real SMS
- **Test:** Send SMS to a test number, confirm delivery
- **Fix:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` must be set

### 4D. Memory persistence
**Flow:** `POST /api/memory/:scope { key, value }` → SQLite local → async Supabase sync
- **Test:** Write a fact, restart server, read it back
- **Fix:** Confirm Supabase service role key allows writes to memory table

### 4E. Rate limit persistence
**File:** `cloud/limits/` or wherever the in-memory Map lives
- Replace the in-memory rate limit Map with a Supabase-backed store
- **Test:** Hit rate limit, restart server, confirm limit is still enforced

---

## Phase 5: Build Job Search (Week 2)

**Goal:** The "Autonomous Job Search" feature advertised on the landing page — sweeps LinkedIn, Indeed, Google Jobs, Upwork, applies with tailored resume.

**This is the biggest unbuilt feature.** It requires Playwright browser automation.

### 5A. Create job search connector
**New file:** `cloud/connectors/jobSearch.js`
- Uses Playwright (headless Chromium) to scrape Indeed and LinkedIn Jobs by keyword + location
- Returns structured list: `{ title, company, url, description, salary }`
- Requires Playwright installed: `npm install playwright` + `npx playwright install chromium`

### 5B. Resume tailoring
**New file:** `cloud/workflows/resumeTailor.js`
- Takes a job description + master resume text
- Sends to DeepSeek/OpenAI: "Rewrite this resume to match this job description"
- Returns tailored resume as markdown or PDF (use `puppeteer` or `markdown-pdf`)

### 5C. Job application submission
**New file:** `cloud/workflows/jobApply.js`
- For each job from 5A: tailor resume (5B) → create task with `pending_approval` status → send Telegram message with job title + company → await approval → if approved, fill form via Playwright
- **Approval gate is mandatory** — never auto-apply without human approval

### 5D. Wire to task bus
**Modify:** `cloud/taskbus/router.js`
- Add case: if task intent matches "job search" or "apply for jobs" → route to `jobSearch` agent
- Add `jobSearch` and `jobApply` to agent registry

### 5E. Add job search tab to dashboard
**Modify:** `ui/src/App.jsx` or add `ui/src/pages/JobSearch.jsx`
- Show active job search campaigns, results, pending applications
- "Review & Apply" button per listing

---

## Phase 6: Build Media Pipeline (Week 2–3)

**Goal:** Script-to-publication: idea → script → voiceover → video → thumbnail → YouTube-ready.

### 6A. Image generation (DALL-E)
**File:** `cloud/connectors/openai.js` (extend after Phase 2A)
- Add `generateImage(prompt, size)` function: POST to `https://api.openai.com/v1/images/generations`
- Returns image URL
- Wire to task bus: intent "generate image" or `assigned_agent: 'dalle'`

### 6B. Voice generation (ElevenLabs)
**New file:** `cloud/connectors/elevenlabs.js`
- POST to ElevenLabs `/v1/text-to-speech/:voice_id`
- Returns audio buffer → save to CloudFlare R2 (`cloud/storage/r2.js` already exists)
- Requires `ELEVENLABS_API_KEY`

### 6C. Video generation (Runway)
**New file:** `cloud/connectors/runway.js`
- POST to Runway API for video generation
- This is optional/aspirational — Runway is expensive. Consider as "Phase 6C: nice to have"
- Requires `RUNWAY_API_KEY`

### 6D. Script-to-publication workflow
**New file:** `cloud/workflows/mediaPipeline.js`
- Orchestrates: `generateScript()` → `generateVoice()` → `generateImage()` → `generateVideo()` → `uploadToR2()` → `exportYouTubeManifest()`
- Each step requires approval before proceeding to next
- Wire to task bus with `assigned_agent: 'media'`

---

## Phase 7: Production Hardening (Week 3)

### 7A. WebSocket real-time updates
**File:** `cloud/ws/` (directory exists)
- Wire the WebSocket server to broadcast task status changes to connected dashboard clients
- **Modify:** `ui/src/App.jsx` — replace 8-second polling with WebSocket subscription
- **Test:** Create a task, watch dashboard update in real-time without page refresh

### 7B. Transaction rollback
**File:** `cloud/taskbus/router.js`
- After approval, if downstream action fails, mark task as `failed` not `approved`
- Add `rollback()` hook: if email fails to send → mark task `failed`, notify user via Telegram
- **Test:** Simulate Resend API failure, confirm task shows as `failed`

### 7C. Full audit trail UI
**File:** `ui/src/pages/Admin.jsx` (Audit tab exists)
- Wire the audit trail tab to `GET /api/memory/audit` or a dedicated endpoint
- Show: who approved what, when, result (sent/failed)
- This makes the approval-gate story real and demonstrable

---

## Phase 8: Fix the Landing Page (Day 1 + ongoing)

**Do this in parallel with Phase 1 — it's urgent.**

### Immediate removals (false claims):
- Remove **GPT-4o** and **Gemini** from AI models list (not in codebase) — add back when Phase 2 is done
- Remove **"GDPR compliance included"** — this is a legal claim you can't make without implementation
- Remove **"AES-256-GCM encryption"** — not confirmed in codebase
- Change **"17/17 smoke tests passing"** to an accurate number after Phase 1

### Change to "coming soon":
- **Autonomous Job Search** — real, in development (Phase 5)
- **Full Media Pipeline** — real, in development (Phase 6)

### Keep as-is (these are real):
- Telegram Command Interface ✅
- Multi-Agent Orchestration ✅
- Human approval before every send ✅
- Supabase, Stripe, Resend integrations ✅
- DeepSeek AI ✅

### Remove immediately (confirmed fake):
- **"247 founders applied"** — confirmed placeholder. Remove from landing page. 
  - Replace with a dynamic count wired to `SELECT COUNT(*) FROM waitlist` in Supabase, shown only when count > 0
  - Or remove the social proof section entirely until you have real numbers

---

## Verification Plan

Each phase has a clear test:

| Phase | Test |
|-------|------|
| 1A | Server starts, all 4 route groups logged, no silent errors |
| 1B | `GET /api/health` returns all services green |
| 1C | `POST /api/waitlist` → row visible in Supabase |
| 2A | Create task → DeepSeek OR OpenAI responds (not Smart Stub) |
| 3A | `POST /api/billing/checkout` → returns real Stripe URL |
| 4A | Email task → approve → email arrives in inbox |
| 4B | Card request → Telegram approve → card in Privacy.com |
| 4C | `POST /api/phone/sms` → SMS delivered to test number |
| 5 | Job search task → results in dashboard → approve → application submitted |
| 6 | Script → voice file in R2 → image generated → manifest exported |
| 7A | Create task → dashboard updates without refresh |
| 8 | Landing page claims match what actually works |

---

## Timeline Summary

| Phase | What | Days |
|-------|------|------|
| 1 | Fix silent failures, add env vars, Supabase schema | 1–2 |
| 2 | GPT-4o + Gemini providers | 3–4 |
| 3 | Stripe billing end-to-end | 4–5 |
| 4 | Verify email, cards, SMS, memory, rate limits | 5–7 |
| 5 | Job search (Playwright, resume tailor, apply flow) | 8–14 |
| 6 | Media pipeline (DALL-E, ElevenLabs, Runway) | 14–21 |
| 7 | WebSocket, rollback, audit trail | 21–24 |
| 8 | Landing page fixes | Day 1 + ongoing |

**Total: ~3.5 weeks to a real, fully functional product.**
