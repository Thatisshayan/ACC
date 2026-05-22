# ACC v2 — Master Handoff & New Chat Prompt
# Generated: 2026-05-22 | Branch: safety/desktop-autostart-checkpoint
# Latest commit: bded4a3

---

## COPY THIS ENTIRE BLOCK INTO NEW CHAT

---

You are continuing ACC v2 (Agent Command Center) development.
Read every line. No explanations needed. Execute immediately.

### SYSTEM STATE — CONFIRMED LIVE RIGHT NOW

| Item | Value |
|---|---|
| Local server | http://localhost:4000 (PM2, online) |
| Local bot | @OurAccbot (PM2, online) |
| Railway ACC | https://acc-REDACTED-a26c.up.railway.app/api/health → 200 ✅ |
| Railway TapCash | https://nurturing-freedom-REDACTED-2b46.up.railway.app/api/health → 200 ✅ |
| Railway PORT fix | PORT=8080 applied by Codex — both services healthy |
| Repo | github.com/Thatisshayan/ACC branch: safety/desktop-autostart-checkpoint |
| Latest commit | bded4a3 (chore: gitignore electron builds — 457 files cleaned) |
| Desktop exe | C:\Users\Shaya\agent-command-center\desktop\dist-verify3\win-unpacked\ACC v2.exe |
| UptimeRobot | https://stats.uptimerobot.com/j7bhB9jMj4 |

### LOCAL PATHS

```
ACC repo:     C:\Users\Shaya\agent-command-center
TapCash repo: C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash_mvp
Alphonso:     C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2
PM2 start:    C:\Users\Shaya\agent-command-center\start-acc.bat
```

### PM2 COMMANDS (run in terminal if server is down)

```cmd
cd C:\Users\Shaya\agent-command-center
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd start pm2.config.js
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd save
```

### ENVIRONMENT — 51 KEYS LOADED

All set in `.env` (gitignored). Key ones:
- DEEPSEEK_API_KEY ✅ (primary AI)
- TELEGRAM_BOT_TOKEN ✅ | SHAYAN_TELEGRAM_CHAT_ID=REDACTED
- OPENAI_API_KEY ✅ (billing capped — use Alibaba for images)
- ALIBABA_API_KEY ✅ (needs DashScope key — current one is wrong format)
- HUNTER_API_KEY ✅ | HUNTER_DISCOVER_API_KEY ✅
- RESEND_API_KEY ✅
- TAVILY_API_KEY ✅
- COMPOSIO_API_KEY ✅
- SUPABASE_URL ✅ | SUPABASE_ANON_KEY ✅
- AIRTABLE_API_KEY ✅ | CLICKUP_API_KEY ✅ | NOTION_API_KEY ✅
- OPENHANDS_URL ✅ | GITHUB_TOKEN ✅
- ACC_VAULT_MASTER_KEY ✅ | ACC_APPROVAL_HMAC_SECRET ✅
- CREWAI_ENABLED=true | AIDER_ENABLED=true | ALPHONSO_ENABLED=true

### SECURITY ISSUE — DONE ✅

data/railway_vars.txt (plaintext secrets) — DELETED and removed from git.
Railway vars are managed in Railway dashboard only (PORT=8080 set).

### BOT PREFIXES — ALL ACTIVE

```
task: goal: openhands: code: crew: crewai: aider: composio:
tavily: research: alphonso: local: image: generate: img:
qwen: alibaba: hunter: find email: resend: send email: email:
post: meta: instagram: facebook: job search: find jobs:
```

### AGENT ROSTER

| Agent | Status | Key |
|---|---|---|
| DeepSeek | ✅ Primary AI | Set |
| OpenHands | ✅ Railway deployed | Set |
| Aider | ✅ Installed | AIDER_ENABLED=true |
| CrewAI | ✅ Installed | CREWAI_ENABLED=true |
| Alphonso/Ollama | ✅ Wired | ALPHONSO_ENABLED=true |
| Composio | ✅ Key set | app.composio.dev for tool connections |
| Tavily | ✅ Live | Real-time web search |
| Hunter.io | ✅ Live | Email finder |
| Resend | ✅ Live | Email sending (approval-gated) |
| Alibaba/Qwen | ⚠️ Key format wrong | Need DashScope key from dashscope.aliyuncs.com |
| Image Gen | ⚠️ Blocked | OpenAI billing capped + Alibaba key wrong |
| Meta/Instagram | ⚠️ Needs setup | Get tokens from developers.facebook.com |

### ARCHITECTURE — HOW ACC WORKS

```
Telegram @OurAccbot
    ↓
bot.js → handleMessage/handleCallback
    ↓
telegramCommands.js → createTaskFromMessage (agent detection)
    ↓
Task Bus API POST /api/taskbus/task
    ↓
router.js → BYPASS AGENTS first (imagegen/tavily/hunter/alibaba)
           → then safety gate
           → then agent-specific handlers
           → then providerFallback (DeepSeek → Alibaba → Ollama → SmartStub)
    ↓
Result returned to bot → sendMsg to user
```

### COMPLETED THIS SESSION (May 22)

- ✅ 300MB Electron binaries removed from git (bded4a3)
- ✅ data/railway_vars.txt security issue resolved
- ✅ Railway PORT=8080 fix (Codex) — both URLs 200 OK
- ✅ Hunter.io connector (cloud/integrations/hunter.js)
- ✅ Resend email connector (cloud/integrations/resend.js)
- ✅ Alibaba/Qwen connector (cloud/integrations/alibaba.js)
- ✅ ImageGen multi-provider (cloud/integrations/imageGen.js)
- ✅ Runnable agent connector (cloud/integrations/runnable.js)
- ✅ Outreach CRM module (cloud/workflows/accOutreachCrmModule.js)
- ✅ Router bypass for utility agents (imagegen/tavily/hunter/alibaba run before safety gate)
- ✅ Approval inline buttons (✅/❌ tappable in Telegram)
- ✅ Agent picker when no prefix used
- ✅ Windows startup shortcut (ACC-Start.lnk in shell:startup)

### WHAT CODEX BUILT (commit 3a0aba7)

- Desktop main.js: auto-starts backend, shows Online/Starting/Offline/Failed
- 3 working .exe builds (all in desktop/dist-verify* — now gitignored, files still on disk)
- Tavily returns structured {success, output, summary, provider}
- Resend real approval flow
- Alibaba in provider fallback chain
- Telegram approval reroutes approved tasks automatically

---

## IMMEDIATE TASKS (start these first, in order)

### TASK 1 — Outreach CRM Test (10 min)

Test the Outreach CRM module Codex built:

```cmd
curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/health
```

If healthy, test with Google Sheets (share your leads sheet publicly, get CSV URL):
```
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv
```

Then bootstrap:
```cmd
curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/bootstrap ^
  -H "Content-Type: application/json" ^
  -d "{\"sheetCsvUrl\":\"YOUR_CSV_URL\",\"maxLeads\":10,\"sink\":\"airtable\"}"
```

Expected: tasks created in Task Bus, leads mirrored to Airtable, approvals pending.

### TASK 2 — Wire Full Outreach Pipeline (This Week's Big Win)

Build end-to-end: Hunter finds emails → DeepSeek writes message → Resend sends → CrewAI tracks.

Queue this via ACC Task Bus from new chat:
```
openhands: Read cloud/workflows/accOutreachCrmModule.js and cloud/integrations/hunter.js and cloud/integrations/resend.js. Wire them together: after leads bootstrap, for each lead automatically call hunter.findEmail(lead.domain, lead.firstName, lead.lastName), then generate a personalized outreach email using DeepSeek, then queue it in Resend with approval_required=true. Save pipeline result to data/outreach-results.json. Commit and push.
```

### TASK 3 — Desktop App (5 min)

Launch the app — it's already built:
```
C:\Users\Shaya\agent-command-center\desktop\dist-verify3\win-unpacked\ACC v2.exe
```
Double-click it. Should show dashboard + Online status.
If blank: rebuild with `cd ui && npm run build` first.

### TASK 4 — TapCash Railway Fix

Send to @OurAccbot:
```
openhands: Fix TapCash Railway deployment. Repo: github.com/Thatisshayan/Tapcash branch main. Problem: Firebase admin SDK crashes because FIREBASE_PRIVATE_KEY env var has literal \n instead of real newlines. Fix: in src/lib/firebaseAdmin.ts, replace the key parsing with: privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'). Also verify FIREBASE_PROJECT_ID and FIREBASE_CLIENT_EMAIL are set in Railway vars. Commit fix and push to main.
```

### TASK 5 — Supabase Tables

Go to supabase.com → your project → SQL Editor → New Query
Paste content of: `C:\Users\Shaya\agent-command-center\tasks\supabase-setup.sql`
Click Run. Creates acc_tasks, acc_results, acc_users tables.
This makes Railway data persist across restarts.

### TASK 6 — Fix Alibaba Image Gen

Get the correct DashScope API key:
1. Go to: https://dashscope.aliyuncs.com
2. Login with your Alibaba account
3. Go to API Keys section
4. Create new key — it starts with `sk-`
5. Add to .env: ALIBABA_API_KEY=sk-YOUR_NEW_KEY
6. Run: pm2 restart all --update-env
7. Test: send `image: a sunset over Toronto` to bot

---

## TAPCASH STATUS

```
Repo: github.com/Thatisshayan/Tapcash (main branch)
Railway: https://nurturing-freedom-REDACTED-2b46.up.railway.app ✅ 200 OK
Local: C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash_mvp
```

Already built:
- Firebase Auth (login/signup) ✅
- Wallet with atomic balance ✅
- Postback handler /api/postback (Lootably) ✅
- Admin panel with real data ✅
- Withdrawal approve/reject ✅
- Offers API ✅
- Click tracking ✅
- Referrals page ✅
- Landing page ✅

Pending:
- Firebase env var fix (FIREBASE_PRIVATE_KEY newline issue) — use openhands task above
- Firebase service account rotation (old key was in git history — SECURITY)
- Admin user setup: `node set_admin.js YOUR_UID` in tapcash root
- Lootably application (needs professional landing page first)

ACC → TapCash integration plan (AGENT_HANDOFF.md):
- ACC EventBus fires payment:completed events
- TapCash subscribes via webhook
- Shared Supabase database for cross-system data

---

## NEXT SESSION PRIORITIES

1. Test outreach CRM end-to-end with real leads
2. Wire Hunter + Resend into full pipeline
3. Fix TapCash Firebase Railway issue
4. DashScope key for image generation
5. Supabase tables for Railway persistence
6. Composio tool connections (gmail, slack, github at app.composio.dev)
7. Bot UI placeholder buttons — wire remaining feature callbacks

---

## HOW TO USE ACC TASK BUS FROM NEW CHAT

Pattern for queuing any task via DC tool:
```javascript
// In _script.js then: cd acc_repo && node _script.js && del _script.js
require('dotenv').config();
var axios = require('axios');
axios.post('http://localhost:4000/api/taskbus/task', {
  title: 'Your task title',
  instruction: 'Detailed instruction here',
  assigned_agent: 'claude', // or: openhands, aider, tavily, hunter, imagegen, etc
  automation_mode: 'semi_auto',
  approval_required: false,
  priority: 'critical',
  created_by: 'claude_operator',
  feature_ref: 'session-name'
}, { timeout: 90000 }).then(r => {
  console.log('Status:', r.data.routing.status);
  console.log('Output:', (r.data.routing.output||'').slice(0,500));
  process.exit(0);
}).catch(e => { console.log('ERR:', e.message); process.exit(1); });
```

Always: syntax check with `node --check file.js`, restart with `pm2 restart all --update-env`, commit with `git add -A && git commit -F .cm && git push`.

---

## CODEX HANDOFF NOTE (leave this in AGENTS.md)

Claude completed May 22 session:
- Removed 300MB Electron binaries from git
- Deleted plaintext railway_vars.txt (security)
- Hunter/Resend/Alibaba/ImageGen/Runnable connectors all wired
- Router bypass for utility agents
- Approval inline buttons working
- Agent picker for unrouted tasks
- Railway PORT=8080 confirmed (Codex did the fix — verified 200 OK)

Next agent: start with TASK 1 (Outreach CRM test) — highest value.
DC MCP tool available for file operations.
Use ACC Task Bus (localhost:4000) for all heavy work — saves Claude tokens.
