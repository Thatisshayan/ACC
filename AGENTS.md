# ACC — Agent Command Center Agent Rules

This file is the first-stop instruction set for any agent working in this repository.

## Mandatory Read Order

Before planning, editing, auditing, or reporting completion, every agent must read:

1. [README.md](./README.md)
2. `.env.example` — all required environment variables and their purposes
3. [ACTIVATION.md](./ACTIVATION.md) — deployment checklist and service activation
4. [cloud/README.md](./cloud/README.md) (if exists) or inline documentation in `cloud/server.js`
5. The latest implementation notes in `CLAUDE.md` (if exists)

If the task is an audit or security-related, also read:

1. `cloud/security/` — policy.js, vaultStub.js, tokenManager.js, piiRedactor.js
2. `cloud/executor.js` — role-based access control and approval workflow
3. The deployment status and any recent Railway logs

## Repo Rules

The authoritative repo structure and conventions are in:

- **API**: `cloud/server.js` (Express entry point) and `cloud/connectors/` (integration layer)
- **Worker**: `cloud/worker.js` (priority queue executor) and `cloud/graphRunner.service.js` (unified graph runner with retry/DLQ)
- **Telegram Bot**: `cloud/telegram/bot.js` (webhook mode on Railway) and `cloud/telegram/features/` (command modules)
- **UI**: `ui/src/` (React + Vite dashboard)
- **Database**: Supabase PostgreSQL (credentials in `.env`)
- **Storage**: Cloudflare R2 (media files) and Supabase (structured data)

Agents must follow these conventions:

- All outbound connector calls go through `cloud/executor.js` with role-based approval
- Connector integrations go in `cloud/connectors/` — one file per service (openai.js, deepseek.js, etc.)
- Graph expansion and multi-step task orchestration live in `cloud/orchestrator/`
- Telegram commands are modules in `cloud/telegram/features/`
- UI pages are React components in `ui/src/pages/`
- Error recovery is centralized in `cloud/utils/retryPolicy.js` and handled in `graphRunner.service.js`
- All state persists to Supabase or R2 (no in-memory-only state)
- Approval gates must use `signedApprovals.js` HMAC signing for tamper evidence

## Key Architectural Patterns

- **Graph Runner (unified)**: `cloud/graphRunner.service.js` handles dependency resolution, retries (exponential backoff), dead-letter queue (disk-persisted), and snapshot creation
- **Role-Based Executor**: `cloud/executor.js` routes tasks through `connectorRouter.js` or `agentRouter.js` based on role and rate limits
- **Approval Workflow**: Snapshots created before any state change; approved snapshots are atomically committed
- **Dead Letter Queue**: Failed nodes go to `cloud/dlq/handler.js`; admins retry via `/admin/dlq/:id/retry`
- **Connectors**: Each integration (OpenAI, Runway, Kijiji, Gmail, etc.) is a drop-in module with a `handle(input)` function
- **Telegram**: Webhook mode on Railway; bot polling disabled locally (use `/api/telegram-webhook` instead)

## Completion Standard

An agent must not mark work complete until all of the following are true:

- Code changes are actually applied and tested locally (`npm start` + manual verification)
- Connector/service integration is wired into the executor or router
- Approval gates are in place where sensitive (marketplace posting, email sending, resume modification)
- Error recovery (retry, DLQ, snapshot recovery) is tested
- Tests pass (`npm test` if test suite exists)
- Deferred items (if any) are documented in this file or in `CLAUDE.md`
- The final report distinguishes completed work, deferred work, and pre-existing issues

## Known Issues & Gaps

### Current Blockers (as of latest update)

- [ ] **Missing Dependency**: Some module is failing silently on Railway; run `GET /api/debug` to identify it
- [ ] **Supabase Service Role Key**: Required for backend operations; retrieve from Supabase dashboard and add to Railway env
- [ ] **SQL Tables**: New Supabase project needs tables created (see ACTIVATION.md Step 1)
- [ ] **Stripe Products**: 3 price IDs must exist in Stripe dashboard before billing works
- [ ] **Privacy.com API**: PRIVACY_API_KEY must be added to Railway for virtual card generation
- [ ] **Code Signing**: Windows SmartScreen warning on desktop exe (needs certificate)
- [ ] **GitHub Release**: Required for auto-updater (desktop) to fetch versions
- [ ] **Apple Developer Account**: Ready; use for EAS iOS build when needed

### What Works

✅ acccommand.center domain
✅ Landing page at `/`
✅ Login page at `/login` (Supabase magic link)
✅ Auth guard at `/app`
✅ Android APK (built via EAS)
✅ Desktop portable exe
✅ Railway nixpacks build (auto-deploy on `master` push)
✅ GitHub auto-deploy

### Connectors Status

| Connector | Status | Notes |
|-----------|--------|-------|
| OpenAI | Ready | GPT models for content + tailoring |
| DeepSeek | Ready | Reasoning for complex tasks |
| Gemini | Ready | Fallback LLM |
| DALL·E | Ready | Image generation |
| Runway | Ready | Video generation |
| Pika | Stub | Video (lower priority) |
| Luma | Stub | Video (lower priority) |
| Sora | Stub | Video (awaiting access) |
| ElevenLabs | Ready | TTS |
| Whisper | Ready | Speech-to-text |
| Gmail | Ready | Email read + send |
| LinkedIn | Ready | Job search |
| Indeed | Ready | Job search |
| Google Jobs | Ready | Job search |
| Fiverr | Ready | Job listings |
| Upwork | Ready | Job listings |
| Kijiji | Sandbox | Marketplace (test mode; enable via `npm run canary:enable kijiji`) |
| Facebook Marketplace | Disabled | Marketplace (disabled) |
| Notion | Ready | LTM backup storage |
| ClickUp | Ready | Task management |
| Stripe | Ready | Billing + payments |
| Shopify | Stub | E-commerce |
| Browser (Playwright) | Ready | Web scraping + automation |
| Telegram | Live | Webhook mode on Railway |

## Deployment

Pushing to `master` triggers:

1. GitHub Actions CI (tests)
2. Railway auto-deploy
3. nixpacks build (faster than Docker)
4. Bot registers webhook automatically
5. UI served as static files from same Railway instance

To deploy locally:

```bash
npm start                # Backend on :4000 + worker
cd ui && npm run dev     # UI on :5173
```

## Testing

```bash
npm test                 # Router, security, store tests
npm run smoke           # Runtime smoke tests
```

## Support

- **User manual**: Check `ui/` or landing page docs
- **Deployment issues**: See ACTIVATION.md
- **Connector failures**: Check `cloud/dlq/` and retry via `/admin/dlq/:id/retry`
- **Missing dependencies**: Run `GET /api/debug` to identify what's failing on Railway
