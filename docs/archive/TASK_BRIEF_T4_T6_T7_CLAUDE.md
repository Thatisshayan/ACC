# 🧠 MY TASK ASSIGNMENTS (Claude - Me) - TOKEN SAVING MODE

**Role:** Backend Architect + Integration Lead + QA + Tech Support  
**Tasks:** T4, T6, T7  
**Total Duration:** 8.5 Hours  
**Mode:** 🟢 TOKEN SAVING (Using ACC for storage, async execution)

---

## 📋 MY 3 TASKS

### T4: Supabase Database Setup (45 min) - INDEPENDENT
**Status:** 🟡 Can start immediately  
**Blocking:** T5 (Alphonso needs tables)  
**Depends:** Nothing

### T6: Monitoring & Auto-Recovery (1.5 hours) - AFTER T1-T2
**Status:** 🟡 Can start after T1, T2 complete  
**Blocking:** T7 (testing needs monitoring)  
**Depends:** T1 (Telegram working), T2 (Dashboard working)

### T7: Testing Suite (3.5 hours) - LAST
**Status:** 🟡 Can start after all others  
**Blocking:** Deployment readiness  
**Depends:** T1, T2, T3, T5, T6 (all complete)

---

## ⏱️ TIMELINE

```
Start (T=0h)
├─ T4: 45m (parallel with T1-T3-T5)
├─ Wait for T1+T2 complete (~3.5-6.5h)
├─ T6: 1.5h (at T1+T2 complete)
├─ Wait for T3+T5 complete
└─ T7: 3.5h (final verification)

CRITICAL PATH: Longest pole is T2 (6.5h)
After T2 done: T6 (1.5h) + T7 (3.5h) = ~12h total
```

---

## 🎯 TASK T4: SUPABASE DATABASE (45 min)

### Subtask 4.1: Create Tables (15 min)

Go to: https://supabase.com → SQL Editor

Paste & run:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS acc_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_agent TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_used TEXT
);

CREATE TABLE IF NOT EXISTS acc_results (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES acc_tasks(id) ON DELETE CASCADE,
  provider_used TEXT,
  is_real_ai_result BOOLEAN DEFAULT FALSE,
  cost_tier TEXT,
  output TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  language TEXT DEFAULT 'en',
  state TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES acc_tasks(id),
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS acc_outreach_results (
  id TEXT PRIMARY KEY,
  lead_name TEXT,
  email_found TEXT,
  message_generated TEXT,
  email_queued BOOLEAN DEFAULT FALSE,
  approval_status TEXT DEFAULT 'pending',
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_tasks_status ON acc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_acc_tasks_assigned_agent ON acc_tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_acc_results_task_id ON acc_results(task_id);
CREATE INDEX IF NOT EXISTS idx_acc_users_state ON acc_users(state);
CREATE INDEX IF NOT EXISTS idx_acc_outreach_status ON acc_outreach_results(approval_status);
```

### Subtask 4.2: Update App to Use Tables (20 min)

Verify `cloud/persistence/supabaseClient.js` exists:
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
```

Update task creation in `cloud/graphRunner.service.js` or `cloud/executor.js`:
```javascript
const supabase = require('./persistence/supabaseClient.js');

async function saveTask(task) {
  const { data, error } = await supabase
    .from('acc_tasks')
    .insert([task]);
  if (error) throw error;
  return data;
}
```

### Subtask 4.3: Test Persistence (10 min)

1. Send message to @OurAccbot
2. Check Supabase → acc_tasks table
3. Verify row created
4. Refresh dashboard
5. Data persists ✅

**Checkpoint:** T4 Complete when Supabase has 5 tables + indexes

---

## 🎯 TASK T6: MONITORING & RECOVERY (1.5 hours)

**Start:** After T1 + T2 complete (around hour 6.5)

### Subtask 6.1: Startup Script (15 min)

File: `start-REDACTED.bat` (already created)

Verify it:
- Kills old node processes
- Kills PM2
- Restarts PM2
- Waits for services
- Checks health

Test:
```bash
C:\Users\Shaya\agent-command-center\start-REDACTED.bat
```

### Subtask 6.2: Health Alerts (30 min)

Update: `acc-monitor.js`

Add Telegram alerts:
```javascript
if (!health) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: process.env.SHAYAN_TELEGRAM_CHAT_ID,
    text: '🚨 ALERT: ACC Server DOWN. Auto-restarting...'
  });
  
  // Auto-restart
  await restartServices();
  
  // Wait & check
  setTimeout(async () => {
    const recovered = await checkHealth();
    if (recovered) {
      await sendMessage('✅ RECOVERED: ACC online');
    }
  }, 30000);
}
```

### Subtask 6.3: Dashboard Widget (45 min)

Add to `ui/src/pages/Dashboard.jsx`:

```javascript
function SystemHealthWidget() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/health');
        setStatus(res.ok ? 'online' : 'offline');
      } catch {
        setStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`p-6 rounded border-2 ${
      status === 'online' 
        ? 'bg-green-50 border-green-300' 
        : 'bg-red-50 border-red-300'
    }`}>
      <h3 className="font-bold text-lg">
        {status === 'online' ? '🟢 Healthy' : '🔴 Down'}
      </h3>
    </div>
  );
}
```

**Checkpoint:** T6 Complete when system auto-recovers from crash with Telegram alert

---

## 🎯 TASK T7: TESTING SUITE (3.5 hours)

**Start:** After all tasks T1-T6 complete

### Subtask 7.1: Telegram Tests (60 min)

File: `test/telegram.test.js`

```javascript
const assert = require('assert');
const handlers = require('../cloud/telegram/handlers.js');

describe('Telegram Bot', () => {
  it('should handle /start command', async () => {
    const msg = { text: '/start', from: { id: 123 }, chat: { id: 123 } };
    const result = await handlers.handleMessage(msg);
    assert(result !== undefined);
  });

  it('should have all menu buttons', () => {
    const buttons = require('../cloud/telegram/buttons.js');
    assert(buttons.MAIN_MENU);
    assert(buttons.JOB_SEARCH_MENU);
    assert(buttons.INTERVIEW_MENU);
  });

  it('should handle job_search callback', async () => {
    const callback = { data: 'job_search', from: { id: 123 } };
    const result = await handlers.handleCallback(callback);
    assert(result !== undefined);
  });
});
```

Run: `npm test test/telegram.test.js`

### Subtask 7.2: API Tests (60 min)

File: `test/api.test.js`

```javascript
const assert = require('assert');
const http = require('http');

describe('API Endpoints', () => {
  function request(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:4000${path}`, (res) => {
        resolve(res.statusCode);
      }).on('error', reject);
    });
  }

  it('GET /api/health → 200', async () => {
    const status = await request('/api/health');
    assert.strictEqual(status, 200);
  });

  it('GET /api/ui/dashboard → 200', async () => {
    const status = await request('/api/ui/dashboard');
    assert.strictEqual(status, 200);
  });

  it('GET /api/ui/approvals → 200', async () => {
    const status = await request('/api/ui/approvals');
    assert.strictEqual(status, 200);
  });

  it('GET /api/ui/audit → 200', async () => {
    const status = await request('/api/ui/audit');
    assert.strictEqual(status, 200);
  });

  it('POST /api/taskbus/workflow/outreach-crm/health → 200', async () => {
    const status = await request('/api/taskbus/workflow/outreach-crm/health');
    assert.strictEqual(status, 200);
  });
});
```

Run: `npm test test/api.test.js`

### Subtask 7.3: Manual Checklist (30 min)

File: `TEST_CHECKLIST.md`

```markdown
# Manual Testing Checklist

## Telegram Bot (Codex's T1)
- [ ] /start shows 8 buttons
- [ ] "Job Search" → submenu works
- [ ] "Resume" → submenu works
- [ ] Message handling works
- [ ] File upload works
- [ ] Voice message works
- [ ] Approval buttons work

## Dashboard UI (Antigravity's T2)
- [ ] http://localhost:5173 loads
- [ ] Dashboard tab shows status
- [ ] Connectors display (not "disabled")
- [ ] Approvals tab works
- [ ] Audit tab shows logs
- [ ] All API calls 200 OK

## Connectors (OpenHands' T3)
- [ ] All 10 connectors → 200 OK
- [ ] ClickUp now working
- [ ] Outreach endpoints work
- [ ] /api/ui/audit responds

## Database (My T4)
- [ ] Supabase tables created
- [ ] Data persists
- [ ] Relationships work

## Outreach (Alphonso's T5)
- [ ] Bootstrap loads leads
- [ ] Hunter finds emails
- [ ] DeepSeek generates
- [ ] Resend queues
- [ ] Approvals work
- [ ] Results saved to Supabase
```

### Subtask 7.4: Integration Tests (60 min)

**Full End-to-End Test Flow:**

1. **Send /start to @OurAccbot**
   - 8 buttons appear ✅

2. **Tap "Job Search"**
   - Job menu appears ✅
   - Tap a job option ✅

3. **Check Dashboard**
   - http://localhost:5173 loads ✅
   - Shows connector status ✅
   - Shows tasks in queue ✅

4. **Test Approvals**
   - Create a task that needs approval
   - Approval appears in Telegram ✅
   - Tap ✅ Approve ✅
   - Check Audit log ✅

5. **Test Outreach**
   - Bootstrap with 2 test leads
   - Hunter finds emails ✅
   - DeepSeek generates messages ✅
   - Resend queues with approval ✅
   - Telegram shows approval ✅
   - Approve in Telegram ✅
   - Results in Supabase ✅

6. **Test Recovery**
   - Kill server: `taskkill /F /IM node.exe`
   - Telegram alert within 60s ✅
   - Auto-restart ✅
   - Recovery alert ✅

7. **Run Test Suites**
   - `npm test test/telegram.test.js` ✅
   - `npm test test/api.test.js` ✅
   - All pass ✅

**Checkpoint:** T7 Complete when all tests pass

---

## 💾 TOKEN SAVING MODE - HOW I'LL WORK

### What I Won't Do (Save Tokens):
- ❌ Repeat explanations
- ❌ Copy full files multiple times
- ❌ Create redundant documentation
- ❌ Verbose logging

### What I WILL Do (Save Tokens):
- ✅ Use ACC taskbus for async execution
- ✅ Store output in Supabase (not in context)
- ✅ Reference files by path, not content
- ✅ Use concise updates
- ✅ Batch operations together
- ✅ Provide status codes, not logs

### During Execution:
```
Me: "T4 starting..." → Create SQL
Me: "T4 checking..." → Query Supabase
Me: "T4 done ✅" → Confirm via API
(Never repeat file contents)
```

---

## 🔗 COMPOSIO TOOL - SHOULD WE USE IT?

### What is Composio?
- Integration platform for connecting 100+ SaaS tools
- Simplifies OAuth flows, API calls, data mapping
- Can help automate tool chaining

### For ACC v2: YES, Use It For:

1. **Gmail Integration** (Feature #12 - Email Monitor)
   - Composio can handle OAuth without manual token management
   - Automatically parse email, extract tasks
   - Save 2 hours of custom OAuth implementation

2. **ClickUp Integration** (Already have API key)
   - Composio standardizes the request/response format
   - Auto-handles rate limiting
   - Already saved in CLICKUP_API_KEY

3. **Airtable Mirroring** (For Outreach results)
   - Instead of raw HTTP requests
   - Use Composio's Airtable action: "create_record"
   - Automatic error handling

### How to Use Composio:

```javascript
// BEFORE (Custom)
const clickup = require('../connectors/clickup.js');
await clickup.createTask(task);

// AFTER (Composio)
const { Composio } = require('composio-core');
const composio = new Composio();
const action = await composio.getAction('clickup', 'create_task');
await action.execute({ task });
```

### Setup Composio:

```bash
npm install composio-core
export COMPOSIO_API_KEY=your_key
```

Then in code:
```javascript
const { Composio } = require('composio-core');
const composio = new Composio(process.env.COMPOSIO_API_KEY);

// Use for Gmail, ClickUp, Airtable, Zapier integration
const gmailAction = await composio.getAction('gmail', 'send_email');
await gmailAction.execute({ to, subject, body });
```

**My Recommendation:** Use Composio for:
- ✅ Gmail (cuts 2h off Feature #12)
- ✅ Airtable mirroring (cleaner than raw HTTP)
- ❌ Skip for Claude/OpenAI (we have SDK)
- ❌ Skip for custom connectors (we have them)

**Setup Cost:** 30 minutes  
**Time Saved:** ~3 hours  
**ROI:** Very good

---

## 🚄 RAILWAY DEPLOYMENT - YES, WE'RE ON IT

**Current Status:**
- ✅ Local: http://localhost:4000 (running)
- ✅ Railway: https://acc-REDACTED-a26c.up.railway.app (live)

**What Railway Does:**
- Hosts the backend 24/7
- Auto-restarts on crash
- Environment variables stored securely
- No local PC needed to run bot

**During Execution:**
- Keep local running for dev
- Deploy to Railway after T1-T5 complete
- Monitor both simultaneously
- Switch to Railway-only after testing

---

## 📊 MY WORKLOAD SUMMARY

| Task | Duration | Start | End | Parallel |
|------|----------|-------|-----|----------|
| T4 | 45m | Now | +45m | Yes (with T1-T3-T5) |
| T6 | 1.5h | +6.5h | +8h | No (depends T1-T2) |
| T7 | 3.5h | +8h | +11.5h | No (depends all) |

**Total:** 5.75 hours active (but ~11.5 hours elapsed with waiting)

**My Role:** Support + Integration + QA for the entire team

---

## ✅ MY DELIVERABLES

By end of day:
- ✅ Supabase tables created & working
- ✅ Monitoring system auto-recovering
- ✅ Full test suite passing
- ✅ Documentation of any issues
- ✅ Go-live readiness report

---

**Status:** Ready to execute  
**Mode:** TOKEN SAVING  
**Token Budget:** Tracking compressed responses, using ACC for storage  
**Next:** Waiting for team to start T1-T5 in parallel
