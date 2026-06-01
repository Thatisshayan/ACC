# Agent 2 — Infrastructure / Env / Vault / Database

## Mission

Make ACC stable, durable, and fail-closed. Replace loose setup with validated config, real migrations, RLS, and safe secret handling.

## Owns

- `cloud/config/*`
- `cloud/security/vault*`
- `cloud/security/webhookHmac.js`
- `migrations/*`
- `scripts/migrate.js`
- `Supabase schema/RLS`
- Railway env documentation
- database persistence contracts

## Do not touch without coordination

- `cloud/server.js route ownership without Agent 1`
- `ui/src/*`
- `cloud/telegram/*`
- `cloud/connectors/* provider behavior unless env contract only`

## Start now

- Create validateEnv.js
- Fail production startup if critical env vars missing
- Remove plaintext vault fallback
- Create migrations for users/roles/tasks/approvals/audit/memory/subscriptions/outreach
- Enable Supabase RLS
- Make Stripe/Telegram webhook secrets mandatory in production

## Merge gate

- [ ] NODE_ENV=production fails startup when critical secrets are missing
- [ ] Vault never writes plaintext in production
- [ ] Migrations are repeatable and documented
- [ ] RLS prevents cross-user task/memory reads
- [ ] Webhook secrets missing in production cause hard failure/rejection

## Assigned task count

- Total rows assigned from master list: **34**
- Priority counts: `{'P1': 17, 'P0': 10, 'P2': 7}`
- Phase counts: `{'3 Env and Core Activation': 16, '0 Emergency Lockdown': 9, '13 Compliance Launch': 3, '11 Reliability Observability': 2, '7 Jobs': 2, '2 Database Auth Migrations': 1, '6 Outreach': 1}`

## Working rule

Keep changes small, testable, and reversible. Do not mark anything complete unless you can show the command, endpoint response, test, or screenshot proving it.
