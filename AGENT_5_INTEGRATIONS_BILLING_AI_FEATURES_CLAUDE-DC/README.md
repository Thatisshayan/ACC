# Agent 5 — Integrations / Billing / AI Provider Chain

## Mission

Turn existing integrations from “coded” into verified, gated, production-safe capabilities.

## Owns

- `cloud/connectors/*`
- `cloud/integrations/*`
- `cloud/api/billingRoutes.js`
- `cloud/api/cardRoutes.js integration logic after Agent 1 auth`
- `cloud/api/phoneRoutes.js`
- `cloud/workflows/outreachPipeline.js`
- `cloud/workflows/jobApply.js`
- `cloud/workflows/mediaPipeline.js`
- AI provider fallback chain
- `Stripe/Privacy/Twilio/Resend/Hunter/Tavily/OpenAI/Gemini/DeepSeek integration behavior`

## Do not touch without coordination

- `cloud/server.js auth mounting without Agent 1`
- `migrations/* without Agent 2`
- `ui/src/* except API response contract docs`
- `landing/* claims without Agent 6`

## Start now

- Verify DeepSeek/OpenAI/Gemini provider chain
- Decide Claude restore/remove
- Fix broken connector exports
- Verify Stripe checkout/webhook
- Make billing tier actually gate feature access
- Verify Resend/Hunter outreach path with consent/approval
- Verify Privacy.com card creation behind approval
- Verify Twilio SMS/calls
- Add provider health checks

## Merge gate

- [ ] No integration runs unauthenticated
- [ ] Billing tier enforcement is real in task routing
- [ ] Provider fallback has tests and honest smart-stub fallback
- [ ] Outreach cannot send without approval/consent safeguards
- [ ] Financial/card actions require approval and audit trail

## Assigned task count

- Total rows assigned from master list: **80**
- Priority counts: `{'P2': 35, 'P1': 31, 'P3': 14}`
- Phase counts: `{'7 Jobs': 23, '4 AI Provider Chain': 20, '6 Outreach': 14, '8 Media': 13, '5 Billing and Access': 7, '11 Reliability Observability': 2, '1 App Loading and Core Verify': 1}`

## Working rule

Keep changes small, testable, and reversible. Do not mark anything complete unless you can show the command, endpoint response, test, or screenshot proving it.
