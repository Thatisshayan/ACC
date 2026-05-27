# ACC v2 — Agent Command Center

**Version:** 2.0  
**Owner:** Shayan  
**Bot:** @OurAccbot (Telegram — runs 24/7 on Railway via webhook)  
**Server:** localhost:4000 (local) · Railway (cloud)

---

## What is ACC v2?

ACC is a personal AI orchestration system that runs autonomous agents to:

- Search for jobs on LinkedIn, Indeed, Google Jobs, Fiverr, Upwork, and the web
- Tailor resumes using Claude AI
- Auto-apply to job listings
- Post items on Kijiji and other marketplaces
- Manage outreach campaigns with opt-in compliance
- Create landing pages and deploy to Netlify
- Produce SEO content (scripts, TTS, video manifests, YouTube metadata)
- Handle legal evidence intake with PII redaction
- Monitor email (IMAP — Gmail, Outlook, custom) for job-related updates
- Full human-in-the-loop approval via Telegram or web UI
- AI assistant chat (Claude, DeepSeek, Gemini, OpenAI, Ollama)
- Media generation (DALL·E, Runway, Pika, Luma, Sora, ElevenLabs, Whisper)

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Thatisshayan/ACC.git
cd agent-command-center
npm install
cd ui && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Start everything (recommended)
.\START_DASHBOARD.bat          # Windows: starts backend + opens UI at :5173

# — OR manually —
npm start                      # Backend on :4000
cd ui && npm run dev           # UI on :5173 (separate terminal)
```

> **Telegram bot** runs on Railway as a webhook — it does not need to be started locally.
> Set `TELEGRAM_BOT_TOKEN` and `WEBHOOK_URL` in Railway environment variables.

---

## One-Shot Installer

```powershell
.\INSTALL_ACC.ps1
```

The installer:
- Checks Node.js ≥ 18
- Creates `.env` template if missing
- Copies `acc-logo.png` / `acc-banner.png` from Desktop/Downloads to `ui/public/`
- Runs `npm install` in root and `ui/`
- Builds the UI (`npm run build`)
- Creates `data/` directory structure
- Creates Desktop shortcut and `START_DASHBOARD.bat`

---

## Project Structure

```
agent-command-center/
├── acc.js                              CLI entry point
├── INSTALL_ACC.ps1                     One-shot installer
├── START_DASHBOARD.bat                 Smart launcher (backend + UI)
├── .env.example                        All required environment variables
├── package.json                        npm scripts
├── scripts/
│   ├── start.js                        Unified startup (API + Worker)
│   ├── smokeRuntime.js                 Runtime smoke tests
│   └── windows/
│       ├── acc-supervisor.js           Windows service supervisor
│       └── start-acc.ps1               PowerShell launcher
├── cloud/
│   ├── server.js                       Express API on :4000
│   ├── executor.js                     Task router (roles + rate limits + vault)
│   ├── graphRunner.service.js          Unified graph runner (dep resolution, retry, DLQ)
│   ├── graphRunner.js                  Legacy runner (backward compat)
│   ├── worker.js                       Priority queue worker
│   ├── queue.js                        In-memory priority queue
│   ├── connectors/                     AI + integration connectors
│   │   ├── openai.js                   OpenAI GPT
│   │   ├── deepseek.js                 DeepSeek reasoning
│   │   ├── gemini.js                   Google Gemini
│   │   ├── ollama.js                   Local Ollama LLM
│   │   ├── dalle.js                    DALL·E image generation
│   │   ├── runway.js                   Runway video generation
│   │   ├── pika.js                     Pika video generation
│   │   ├── luma.js                     Luma AI
│   │   ├── sora.js                     OpenAI Sora
│   │   ├── elevenlabs.js               ElevenLabs TTS
│   │   ├── whisper.js                  Whisper transcription
│   │   ├── browser.js                  Browser automation (Playwright)
│   │   ├── marketplace/
│   │   │   ├── kijiji.js               Kijiji (sandbox default)
│   │   │   └── facebookMarketplace.js  Facebook (disabled)
│   │   ├── deploy/
│   │   │   └── netlify.js              Netlify deploy
│   │   └── integrations/
│   │       ├── notion.js               Notion
│   │       ├── clickup.js              ClickUp tasks
│   │       ├── gmail.js                Gmail / Google Calendar / Drive
│   │       ├── linkedin.js             LinkedIn job search
│   │       ├── indeed.js               Indeed job search
│   │       ├── googlejobs.js           Google Jobs
│   │       ├── fiverr.js               Fiverr
│   │       ├── upwork.js               Upwork
│   │       ├── shopify.js              Shopify
│   │       └── stripe.js               Stripe billing
│   ├── orchestrator/                   Intent + routing + memory
│   │   ├── agentRouter.js              Routes to agents
│   │   ├── connectorRouter.js          Routes to connectors
│   │   ├── mergeEngine.js              Merges connector results
│   │   ├── graphExpander.js            Dynamic graph expansion
│   │   ├── snapshots.js                Disk-persisted snapshot store
│   │   ├── autoMode.js                 Autonomous execution mode
│   │   └── errorRecovery.js            Error recovery strategies
│   ├── graphs/                         Graph builder modules
│   │   ├── graphBuilder_jobs.js        Job search graph
│   │   ├── graphBuilder_resume.js      Resume tailoring graph
│   │   ├── graphBuilder_apply.js       Auto-apply graph
│   │   ├── landingPageBuilder.js       Landing page graph
│   │   └── contentPipeline_seo.js      SEO content graph
│   ├── memory/
│   │   ├── memoryEngine.js             STM + LTM (disk-persisted)
│   │   └── notionStorage.js            Notion LTM backup
│   ├── messages/                       Persistent messaging system
│   ├── storage/
│   │   ├── r2.js                       Cloudflare R2 storage
│   │   └── supabase.js                 Supabase DB
│   ├── security/
│   │   ├── policy.js                   Policy enforcement
│   │   ├── vaultStub.js                AES-256-GCM encrypted vault
│   │   ├── tokenManager.js             Ephemeral token TTL
│   │   ├── ephemeralSnapshots.js       7-day TTL snapshot store
│   │   ├── signedApprovals.js          HMAC tamper-evident approvals
│   │   ├── rateLimiter.js              Token bucket per connector
│   │   ├── piiRedactor.js              Email/phone/SSN/CC redaction
│   │   └── webhookHmac.js              Webhook HMAC verification
│   ├── taskbus/                        Agent task bus
│   │   ├── router.js                   Task routing with provider fallback
│   │   ├── routes.js                   /api/taskbus/* REST endpoints
│   │   ├── store.js                    Task store with WebSocket hook
│   │   └── providerFallback.js         Multi-provider fallback logic
│   ├── telegram/
│   │   ├── bot.js                      Main Telegram bot (webhook mode)
│   │   ├── approvalBot.js              Approval notifications
│   │   ├── botLock.js                  Single-instance guard
│   │   └── features/
│   │       ├── emailMonitor.js         IMAP email monitor (Gmail/Outlook/custom)
│   │       ├── jobTracker.js           Job tracking
│   │       ├── imageAnalysis.js        Image/vision analysis
│   │       ├── lifeTools.js            Life utility tools
│   │       └── vision.js               Vision processing
│   ├── admin/
│   │   ├── api.js                      Admin REST API
│   │   ├── dlqRoutes.js                DLQ management API
│   │   └── graphView.js                Graph visualization data
│   ├── api/
│   │   ├── uiRoutes.js                 UI data endpoints
│   │   ├── statusSummary.js            System status summary
│   │   ├── securityApproval.js         Snapshot approve/reject
│   │   ├── telegramWebhook.js          Telegram webhook receiver
│   │   ├── messages.js                 Messages API
│   │   └── assistant.js                AI assistant API
│   ├── integrations/
│   │   └── crewai.js                   CrewAI multi-agent integration
│   ├── workflows/
│   │   └── dispatcher.js               Workflow dispatcher
│   ├── ws/
│   │   └── server.js                   WebSocket broadcast server
│   ├── dlq/
│   │   └── handler.js                  Dead Letter Queue (disk-persisted)
│   └── utils/
│       ├── logger.js                   Structured logger
│       ├── retryPolicy.js              Exponential backoff + jitter
│       ├── rolePolicy.js               Role permission checks
│       ├── approvalQueue.js            Pending approval queue
│       ├── auditLog.js                 Node execution audit trail
│       ├── negotiationPolicy.js        Auto-counter logic
│       └── campaignManager.js          Opt-in/out + quotas
└── ui/                                 React + Vite dashboard
    ├── public/
    │   ├── acc-logo.png                Brand logo (copy here from Desktop)
    │   ├── acc-banner.png              Brand banner (copy here from Desktop)
    │   └── acc-logo.svg                SVG fallback logo
    ├── src/
    │   ├── App.jsx                     Main app — navigation, live animations, hero banner
    │   ├── VoiceInput.jsx              Voice input component
    │   ├── api.js                      API client (axios)
    │   └── pages/
    │       ├── Dashboard.jsx           System health overview
    │       ├── Approvals.jsx           Pending approval management
    │       ├── Audit.jsx               Execution audit trail
    │       ├── Secrets.jsx             Vault secret names
    │       ├── Assistant.jsx           AI assistant chat
    │       ├── Messenger.jsx           Messaging interface
    │       └── Admin.jsx               Admin panel (System / Logs / Users / Tasks / Connectors / Audit)
    ├── index.css                       Animation library + ACC design system
    ├── tailwind.config.js              Tailwind + ACC brand colors/animations
    └── vite.config.js                  Vite config (proxies :4000)
```

---

## Key Commands

| Command | What it does |
|---------|-------------|
| `npm start` | Start API server + worker on :4000 |
| `npm run ui` | Start React dashboard on :5173 |
| `npm test` | Run test suite (router + security + store) |
| `npm run smoke` | Run runtime smoke tests |
| `npm run canary:enable kijiji` | Enable live Kijiji posting |
| `npm run canary:disable kijiji` | Revert to sandbox |

> **Telegram bot** does not need to be started locally — it runs on Railway via webhook.

---

## API Endpoints

### Health & Core

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/execute` | POST | Enqueue a task |
| `/api/task/:id` | GET | Get task status |
| `/orchestrate` | POST | Build + route task graph |

### UI Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ui/dashboard` | GET | Dashboard data |
| `/api/ui/snapshots` | GET | Pending snapshots |
| `/api/ui/snapshot/:id/approve` | POST | Approve snapshot |
| `/api/ui/snapshot/:id/reject` | POST | Reject snapshot |
| `/api/ui/approvals` | GET | Pending approvals |
| `/api/status` | GET | Status summary |
| `/api/status/summary` | GET | Detailed status |

### Messages & Assistant

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/messages/status` | GET | Message system status |
| `/api/messages/send` | POST | Send a message |
| `/api/assistant/parse` | POST | Parse intent |
| `/api/assistant/execute` | POST | Execute assistant action |

### Agent Task Bus

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/taskbus/tasks` | GET | List all tasks |
| `/api/taskbus/tasks` | POST | Create task |
| `/api/taskbus/tasks/:id` | GET | Get task |
| `/api/taskbus/tasks/:id` | PATCH | Update task |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/system` | GET | System status + bot health |
| `/admin/users` | GET | All Telegram users |
| `/admin/tasks` | GET | Task queue |
| `/admin/graphs` | GET | Graph snapshots |
| `/admin/logs` | GET | Application logs |
| `/admin/connectors` | GET | Connector registry |
| `/admin/audit` | GET | Audit trail |
| `/admin/dlq` | GET | Dead letter queue |
| `/admin/dlq/:id/retry` | POST | Requeue failed node |
| `/admin/approvals` | GET | Pending approvals |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:4000/ws` | Real-time task updates broadcast |

---

## Roles

| Role | Level | Purpose |
|------|-------|---------|
| Admin | 100 | Full control |
| Operator | 80 | Approve workflows |
| LegalAssistant | 70 | Evidence handling |
| Agent | 60 | Execute nodes |
| Marketing | 60 | Content pipelines |
| SalesBot | 50 | Marketplace/outreach |
| Viewer | 10 | Read-only |

---

## Environment Variables

Key variables to set in `.env`:

```env
# Core
PORT=4000
NODE_ENV=development

# Telegram (Railway webhook mode)
TELEGRAM_BOT_TOKEN=
WEBHOOK_URL=https://your-app.up.railway.app/api/telegram-webhook
TELEGRAM_SECRET_TOKEN=

# AI Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
ELEVENLABS_API_KEY=

# Storage
SUPABASE_URL=
SUPABASE_ANON_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Integrations
NOTION_TOKEN=
STRIPE_SECRET_KEY=
NETLIFY_TOKEN=

# Security
TASKBUS_API_KEY=
VAULT_KEY=
CORS_ALLOWED_ORIGINS=
```

---

## Deployment (Railway)

The backend + Telegram bot run together on Railway:

1. Push to `master` — GitHub Actions CI runs tests
2. Railway auto-deploys from `master`
3. Set all environment variables in Railway dashboard
4. The bot registers its webhook automatically on startup
5. UI is served from the same Railway instance (`ui/dist` built and served as static files)

---

## Brand Assets

Place these files in `ui/public/` before building:

- `acc-logo.png` — round ACC logo (shown in nav + hero)
- `acc-banner.png` — wide ACC v2 banner (shown in dashboard hero)

The installer (`INSTALL_ACC.ps1`) auto-searches your Desktop and Downloads folder for these files.
