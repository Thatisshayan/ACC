# 🎯 ACC v2 COMPLETE IMPLEMENTATION GUIDE

**Last Updated:** May 23, 2026 02:58 UTC  
**Status:** System Online & Operational  
**Current Health:** 75%  
**Target:** 100% (21 hours of work)

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Current State Assessment](#current-state-assessment)
4. [Complete Roadmap to 100%](#complete-roadmap-to-100)
5. [Detailed Task Breakdown](#detailed-task-breakdown)
6. [Testing & Validation](#testing--validation)
7. [Deployment & Monitoring](#deployment--monitoring)
8. [Team Coordination Guide](#team-coordination-guide)

---

## EXECUTIVE SUMMARY

### Current Status
- **System Health:** 75% Operational
- **Backend:** 95% Complete (Solid)
- **Telegram Bot:** 70% Complete (Buttons wired)
- **Dashboard UI:** 35% Complete (Components missing)
- **Connectors:** 90% Complete (1 broken: ClickUp)
- **Database:** 85% Complete (Tables not created)
- **Outreach Pipeline:** 0% Complete (Not wired)

### What Works NOW ✅
- API Server responding on http://localhost:4000
- Telegram Bot @OurAccbot online and polling
- All 57 environment variables loaded
- 9 of 10 connectors functional
- Message routing via taskbus
- GraphRunner & Worker running
- WebSocket connections active
- Supabase configured

### What's Broken ❌
- Telegram button callbacks have no handlers (FIXED - see below)
- Dashboard UI components missing
- 1 connector broken (ClickUp)
- Supabase tables not created
- Outreach CRM endpoint 404
- Logs stale (4+ hours old)

### Files Created Today (May 23)
✅ `cloud/telegram/handlers.js` (336 lines) - Callback handlers  
✅ `cloud/telegram/buttons.js` (103 lines) - Button definitions  
✅ `start-REDACTED.bat` - Auto-monitor script  
✅ `acc-monitor.js` - Health check monitor  
✅ `audit.js` - System audit tool  
✅ `AUDIT_REPORT_FULL.md` - Complete audit  

---

## SYSTEM ARCHITECTURE

### Layer 1: Entry Points
```
Telegram (@OurAccbot)
    ↓
cloud/telegram/bot.js (870 lines)
    ↓
cloud/telegram/handlers.js (336 lines) [NEW]
    ↓
handlers.handleMessage() / handlers.handleCallback()
```

### Layer 2: Routing & Execution
```
Message/Callback
    ↓
cloud/telegram/handlers.js
    ↓
Route via taskbus OR direct handler
    ↓
cloud/executor.js (Task router)
    ↓
cloud/graphRunner.service.js (Execution engine)
```

### Layer 3: Connectors
```
graphRunner.service.js
    ↓
cloud/connectors/* (9/10 working)
    ├── claude.js ✅
    ├── deepseek.js ✅
    ├── openai.js ✅
    ├── notion.js ✅
    ├── hunter.js ✅
    ├── resend.js ✅
    ├── alibaba.js ✅
    ├── tavily.js ✅
    └── clickup.js ❌ (ConnectorClass error)
```

### Layer 4: Persistence
```
graphRunner.service.js
    ↓
Supabase (supabase.co)
    ├── acc_tasks (NOT CREATED)
    ├── acc_results (NOT CREATED)
    ├── acc_users (NOT CREATED)
    └── acc_approvals (NOT CREATED)
```

### Layer 5: UI
```
http://localhost:5173 (React/Vite)
    ├── App.jsx ✅
    ├── pages/Dashboard.jsx ❌ (MISSING)
    ├── pages/Approvals.jsx ❌ (MISSING)
    ├── pages/Audit.jsx ❌ (MISSING)
    └── hooks/useApi.js ❌ (MISSING)
```

---

## CURRENT STATE ASSESSMENT

### Backend Infrastructure ✅ 95%

**Running:**
- acc-server (PID varies) - Status: ONLINE
- acc-bot (PID varies) - Status: ONLINE
- API responding to /api/health
- Worker queue processing
- WebSocket active on /ws
- Supabase connected

**Test Command:**
```bash
node C:\Users\Shaya\agent-command-center\test-health.js
# Expected output:
# 1️⃣ API Health: Status 200 ✅
# 2️⃣ Outreach CRM: Status 404 (endpoint missing)
```

**Server Location:** http://localhost:4000

**Key Routes:**
- GET /api/health → 200 OK
- POST /api/execute → Routes tasks
- GET /api/ui/dashboard → Dashboard data
- GET /api/ui/approvals → Approval list
- GET /admin/system → System health
- POST /api/taskbus/task → Create task
- WS /ws → WebSocket connection

### Telegram Bot ✅ 70%

**Status:** Online, polling active

**Current Capability:**
- /start command works (but shows generic output)
- Message routing works
- File upload works (resume)
- Voice message works
- Text-to-AI routing works

**What's Fixed:**
- ✅ handlers.js created with full callback implementation
- ✅ buttons.js created with 8 menu definitions

**What's Still Needed:**
1. Wire handlers.js into bot.js main loop
2. Connect button menus to handlers
3. Test all 8 button types
4. Add approval button flow

**Files:**
- cloud/telegram/bot.js (870 lines) - ✅ Main bot
- cloud/telegram/handlers.js (336 lines) - ✅ NEW - Callback handlers
- cloud/telegram/buttons.js (103 lines) - ✅ NEW - Button definitions

### Dashboard UI ❌ 35%

**Status:** App.jsx exists but routes missing

**Current Problem:**
- Only App.jsx exists
- Missing Dashboard.jsx, Approvals.jsx, Audit.jsx
- Missing useApi.js hook
- Dashboard shows generic fallback
- Integrations display as "disabled" (but they work)

**What Needs to Be Built:**
1. useApi.js (45 min) - React hook for API calls
2. Dashboard.jsx (90 min) - Main dashboard with connector status
3. Approvals.jsx (60 min) - Approval list & action buttons
4. Audit.jsx (45 min) - Audit log display
5. Route navigation in App.jsx (30 min)

**Build Time:** ~4.5 hours

### Connectors ✅ 90%

**Working (9/10):**
- ✅ Claude API working
- ✅ DeepSeek API working
- ✅ OpenAI API working
- ✅ Notion API working
- ✅ Hunter.io API working
- ✅ Resend API working
- ✅ Alibaba/Qwen API working
- ✅ Tavily API working
- ✅ Composio configured

**Broken (1/10):**
- ❌ ClickUp - ConnectorClass constructor error

**Needs to Be Created:**
1. Outreach CRM endpoint - POST /api/taskbus/workflow/outreach-crm/bootstrap

### Database 🟡 85%

**Status:** Supabase connected, tables NOT created

**What Exists:**
- SUPABASE_URL set in .env
- SUPABASE_ANON_KEY set in .env
- Connection works

**What's Missing:**
- acc_tasks table
- acc_results table
- acc_users table
- acc_approvals table
- Indexes
- RLS policies

**How to Create (15 min):**
Go to https://supabase.com → SQL Editor → Paste SQL → Run

### Outreach Pipeline ❌ 0%

**Status:** Not wired

**Components Available:**
- ✅ Hunter.io connector (find emails)
- ✅ DeepSeek connector (generate messages)
- ✅ Resend connector (send emails)

**What Needs to Be Built:**
1. accFullOutreachPipeline.js - Wire Hunter → DeepSeek → Resend
2. Register endpoints in API
3. Test end-to-end

**Build Time:** 3.5 hours

---

## COMPLETE ROADMAP TO 100%

### Task 1: Wire Telegram Buttons (3.5 hours)

**Status:** 70% → 100%

**Subtasks:**
1. **1.1** (45 min) - Import handlers.js into bot.js
   - Add: `var handlers = require('./handlers.js');`
   - Add: `var buttons = require('./buttons.js');`
   - Replace callback logic with handler calls

2. **1.2** (30 min) - Wire button menus
   - Update sendStartMenu() to use buttons.MAIN_MENU
   - Update all other menu functions
   - Test each button type

3. **1.3** (30 min) - Test all callbacks
   - Send /start → 8 buttons appear
   - Tap each button → callback fires
   - Check logs for no errors

4. **1.4** (20 min) - Wire approval buttons
   - Update handleApprovalCallback()
   - Update handleRejectionCallback()
   - Test with real task approval

5. **1.5** (15 min) - Add missing commands
   - /image, /generate, /research, /email, /weather
   - Add to handleCommand()
   - Test each command

**Files:**
- cloud/telegram/handlers.js (use as-is)
- cloud/telegram/buttons.js (use as-is)
- cloud/telegram/bot.js (MODIFY - add imports, wire handlers)

**Validation:**
```bash
Send /start to @OurAccbot
→ Should see 8 interactive buttons
Tap "Job Search"
→ Should see callback handler fire in logs
```

---

### Task 2: Build Dashboard UI (6.5 hours)

**Status:** 35% → 100%

**Subtasks:**
1. **2.1** (45 min) - Create useApi.js hook
   ```bash
   File: ui/src/hooks/useApi.js
   - useApi() hook for general API calls
   - useDashboard() hook specific
   - useApprovals() hook specific
   - useConnectorHealth() hook specific
   ```

2. **2.2** (90 min) - Create Dashboard.jsx
   ```bash
   File: ui/src/pages/Dashboard.jsx
   - Show system status (Online/Offline)
   - Display connector health (9/10)
   - Show queue length & stats
   - Call useDashboard() & useConnectorHealth()
   ```

3. **2.3** (60 min) - Create Approvals.jsx
   ```bash
   File: ui/src/pages/Approvals.jsx
   - List pending approvals
   - ✅ Approve button → calls API
   - ❌ Reject button → calls API
   - Show approval details
   ```

4. **2.4** (45 min) - Create Audit.jsx
   ```bash
   File: ui/src/pages/Audit.jsx
   - Display audit log (last 100 entries)
   - Filter by action type
   - Show timestamp & user
   ```

5. **2.5** (30 min) - Update App.jsx routing
   ```bash
   Modify: ui/src/App.jsx
   - Add navigation tabs (Dashboard | Approvals | Audit)
   - Route between pages
   - Show current page
   ```

6. **2.6** (30 min) - Build & test
   ```bash
   cd ui
   npm run build
   npm run dev
   Open http://localhost:5173
   Test each page loads correctly
   ```

**Validation:**
```bash
npm run dev
→ http://localhost:5173 opens
Click Dashboard tab → Shows connector status (not "disabled")
Click Approvals tab → Shows approval list
Click Audit tab → Shows logs
All API calls return 200 OK
```

---

### Task 3: Fix Connectors (2 hours)

**Status:** 90% → 100%

**Subtasks:**
1. **3.1** (20 min) - Fix ClickUp connector
   ```bash
   File: cloud/connectors/clickup.js
   Issue: ConnectorClass is not a constructor
   Fix: Export object not class
   
   Change from:
   module.exports = ClickUpConnector;
   
   To:
   module.exports = {
     enabled: () => !!process.env.CLICKUP_API_KEY,
     checkHealth: async () => {...},
     createTask: async (task) => {...}
   };
   ```

2. **3.2** (30 min) - Register Outreach CRM endpoints
   ```bash
   File: cloud/api/uiRoutes.js
   Add: POST /api/taskbus/workflow/outreach-crm/health
   Add: POST /api/taskbus/workflow/outreach-crm/bootstrap
   
   Both should return JSON with health/status
   ```

3. **3.3** (15 min) - Register /api/ui/audit endpoint
   ```bash
   File: cloud/api/uiRoutes.js
   Add: GET /api/ui/audit
   
   Returns last 100 audit log entries
   ```

4. **3.4** (30 min) - Verify all connectors
   ```bash
   Test each endpoint:
   curl http://localhost:4000/api/connectors/clickup/health
   curl http://localhost:4000/api/connectors/hunter/health
   ... (9 more)
   
   All should return 200 OK
   ```

**Validation:**
```bash
curl http://localhost:4000/api/taskbus/workflow/outreach-crm/health
→ 200 OK with health status

curl http://localhost:4000/api/ui/audit
→ 200 OK with audit logs

pm2 logs acc-server
→ No errors about ConnectorClass
```

---

### Task 4: Create Supabase Tables (45 minutes)

**Status:** 85% → 100%

**Subtasks:**
1. **4.1** (15 min) - Create tables via SQL
   ```
   Go to: https://supabase.com
   → Your Project → SQL Editor
   → New Query
   → Paste SQL (provided below)
   → Run
   ```

2. **4.2** (20 min) - Update app to use tables
   ```bash
   File: cloud/persistence/supabaseClient.js
   Verify it exists and exports Supabase client
   
   File: cloud/executor.js or graphRunner.service.js
   Add: save tasks to acc_tasks table
   Add: save results to acc_results table
   ```

3. **4.3** (10 min) - Test persistence
   ```bash
   Send message to @OurAccbot
   → Task created
   Go to Supabase → acc_tasks table
   → Should see new row
   Refresh browser
   → Data persists
   ```

**SQL to Run:**
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

CREATE INDEX IF NOT EXISTS idx_acc_tasks_status ON acc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_acc_tasks_assigned_agent ON acc_tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_acc_results_task_id ON acc_results(task_id);
CREATE INDEX IF NOT EXISTS idx_acc_users_state ON acc_users(state);

ALTER TABLE acc_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_approvals ENABLE ROW LEVEL SECURITY;
```

**Validation:**
```bash
Supabase Console → Tables
→ See acc_tasks, acc_results, acc_users, acc_approvals
→ All have correct columns & indexes
```

---

### Task 5: Build Outreach Pipeline (3.5 hours)

**Status:** 0% → 100%

**Subtasks:**
1. **5.1** (90 min) - Create pipeline workflow
   ```bash
   File: cloud/workflows/accFullOutreachPipeline.js (NEW)
   
   Exports:
   - runOutreachPipeline(leads) - Main pipeline
   - bootstrap(csvUrl, maxLeads, sink) - Bootstrap from sheet
   - mirrorToAirtable() - Mirror results
   - mirrorToClickUp() - Mirror results
   
   Flow:
   Lead → Hunter (find email) → DeepSeek (generate) → Resend (queue) → Approve
   ```

2. **5.2** (30 min) - Register API endpoints
   ```bash
   File: cloud/api/uiRoutes.js
   Add: POST /api/taskbus/workflow/outreach-crm/bootstrap
   Add: GET /api/taskbus/workflow/outreach-crm/status
   
   Parse request: { sheetCsvUrl, maxLeads, sink }
   Call: outreach.bootstrap()
   Return: { success, results }
   ```

3. **5.3** (60 min) - Test pipeline
   ```bash
   Create test sheet with 2 leads
   Call: POST /api/taskbus/workflow/outreach-crm/bootstrap
   
   Verify:
   ✅ Hunter finds emails
   ✅ DeepSeek generates messages
   ✅ Resend queues with approval
   ✅ Approval appears in Telegram
   ✅ Results mirror to ClickUp
   ```

4. **5.4** (20 min) - Logging & monitoring
   ```bash
   Add to Supabase: acc_outreach_results table
   Log each step: loaded, found, generated, queued, approved, sent
   Display in dashboard
   ```

**Validation:**
```bash
curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "sheetCsvUrl": "YOUR_CSV_URL",
    "maxLeads": 2,
    "sink": "clickup"
  }'

→ 200 response with results
→ Check Supabase: acc_outreach_results updated
→ Check Telegram: Approval requests received
```

---

### Task 6: Monitoring & Recovery (1.5 hours)

**Status:** 50% → 100%

**Subtasks:**
1. **6.1** (15 min) - Register REDACTED startup
   ```bash
   Windows Task Scheduler
   Create task: "ACC v2 Production Monitor"
   Trigger: At system startup
   Action: Run C:\Users\Shaya\agent-command-center\start-REDACTED.bat
   Run with highest privileges
   
   Test: Restart Windows → ACC starts automatically
   ```

2. **6.2** (30 min) - Add health alerts
   ```bash
   File: acc-monitor.js
   Modify: checkHealth() function
   On failure: Send Telegram alert 🚨
   Auto-restart services
   On recovery: Send recovery alert ✅
   ```

3. **6.3** (45 min) - Add dashboard widget
   ```bash
   File: ui/src/pages/Dashboard.jsx
   Add: SystemHealthWidget component
   - Shows 🟢 Healthy or 🔴 Down
   - Auto-checks every 30 seconds
   - Shows last check time
   ```

**Validation:**
```bash
Kill server: taskkill /F /IM node.exe
→ Telegram alert within 60 seconds
→ Services auto-restart
→ Recovery alert after restart
→ Dashboard shows status change
```

---

### Task 7: Testing & QA (3.5 hours)

**Status:** 40% → 100%

**Subtasks:**
1. **7.1** (60 min) - Create test suite
   ```bash
   File: test/telegram.test.js
   - Test /start command
   - Test button callbacks
   - Test message routing
   - Test file upload
   
   Run: npm test test/telegram.test.js
   ```

2. **7.2** (60 min) - API tests
   ```bash
   File: test/api.test.js
   - Test /api/health
   - Test /api/ui/dashboard
   - Test /api/ui/approvals
   - Test /api/ui/audit
   - Test outreach endpoints
   
   Run: npm test test/api.test.js
   ```

3. **7.3** (30 min) - Manual checklist
   ```bash
   File: TEST_CHECKLIST.md
   
   Telegram:
   - [ ] /start shows 8 buttons
   - [ ] Each button has callback
   - [ ] Message handling works
   - [ ] File upload works
   - [ ] Voice works
   
   API:
   - [ ] /api/health → 200
   - [ ] /api/ui/dashboard → data
   - [ ] All connectors → 200
   
   Dashboard:
   - [ ] Dashboard page loads
   - [ ] Approvals page works
   - [ ] Audit log displays
   
   Outreach:
   - [ ] Bootstrap loads leads
   - [ ] Hunter finds emails
   - [ ] DeepSeek generates
   - [ ] Resend queues
   - [ ] Approvals work
   ```

4. **7.4** (60 min) - Integration tests
   ```bash
   Run all tests:
   npm test
   
   Manual end-to-end:
   1. Send /start to bot
   2. Tap "Job Search"
   3. Check dashboard
   4. Test outreach pipeline
   5. Approve task in Telegram
   6. Verify data in Supabase
   ```

**Validation:**
```bash
npm test
→ All tests pass ✅

Manual checklist
→ All 30+ items checked ✅

No errors in logs
→ pm2 logs shows no errors ✅
```

---

## DETAILED TASK BREAKDOWN

### Task 1.1: Wire Handlers Into Bot.js (45 minutes)

**File:** `cloud/telegram/bot.js`

**Step 1:** Add imports at top (after line 20)
```javascript
var handlers = require('./handlers.js');
var buttons = require('./buttons.js');
```

**Step 2:** Find the main update loop (around line 700-750)
Look for:
```javascript
async function handleUpdate(update) {
  if (update.callback_query) {
    // OLD: ... inline callback logic
  }
  if (update.message) {
    // OLD: ... inline message logic
  }
}
```

**Step 3:** Replace with:
```javascript
async function handleUpdate(update) {
  // NEW: Delegate to handlers
  if (update.callback_query) {
    return await handlers.handleCallback(update.callback_query);
  }
  if (update.message) {
    return await handlers.handleMessage(update.message);
  }
}
```

**Step 4:** Restart bot
```bash
pm2 restart acc-bot
pm2 logs acc-bot
→ Should see [bot] features initialized
```

**Step 5:** Test
```bash
Send /start to @OurAccbot
→ Should see 8 interactive buttons
```

---

### Task 2.1: Create useApi.js (45 minutes)

**File:** `ui/src/hooks/useApi.js` (NEW)

```javascript
import { useState, useEffect } from 'react';

export function useApi(endpoint, method = 'GET', body = null, deps = [endpoint]) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const options = {
          method: method,
          headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(`http://localhost:4000${endpoint}`, options);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (e) {
        setError(e.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, deps);

  return { data, loading, error };
}

// Convenience hooks
export function useDashboard() {
  return useApi('/api/ui/dashboard');
}

export function useApprovals() {
  return useApi('/api/ui/approvals');
}

export function useAudit() {
  return useApi('/api/ui/audit');
}

export function useConnectorHealth() {
  return useApi('/admin/system');
}

export function useTaskBusHealth() {
  return useApi('/api/taskbus/health');
}
```

---

### Task 2.2: Create Dashboard.jsx (90 minutes)

**File:** `ui/src/pages/Dashboard.jsx` (NEW)

```javascript
import { useDashboard, useConnectorHealth } from '../hooks/useApi';
import { useState, useEffect } from 'react';

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

  const colors = {
    online: 'bg-green-50 border-green-300 text-green-900',
    offline: 'bg-red-50 border-red-300 text-red-900',
    checking: 'bg-yellow-50 border-yellow-300 text-yellow-900'
  };

  const statusText = {
    online: '🟢 System Healthy',
    offline: '🔴 System Down',
    checking: '🟡 Checking...'
  };

  return (
    <div className={`p-6 rounded border-2 ${colors[status]}`}>
      <h3 className="font-bold text-lg">{statusText[status]}</h3>
      <p className="text-sm mt-2">API on :4000 • WebSocket active • Worker running</p>
    </div>
  );
}

function ConnectorStatus() {
  const { data, loading, error } = useConnectorHealth();

  if (loading) return <div>Loading connector status...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  const connectors = data?.connectors || {};
  const connectorNames = [
    'Claude', 'DeepSeek', 'OpenAI', 'Notion', 'Hunter',
    'Resend', 'Alibaba', 'ClickUp', 'Tavily', 'Composio'
  ];

  return (
    <div className="bg-white border rounded p-6">
      <h2 className="text-xl font-bold mb-4">🔗 Integrations</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {connectorNames.map(name => {
          const enabled = connectors[name.toLowerCase()];
          return (
            <div
              key={name}
              className={`p-3 rounded border text-center text-sm font-medium ${
                enabled
                  ? 'bg-green-50 border-green-200 text-green-900'
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}
            >
              {enabled ? '✅' : '⚠️'} {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuickStats() {
  const { data, loading } = useDashboard();

  if (loading) return null;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-blue-50 border border-blue-200 p-4 rounded">
        <p className="text-blue-600 text-sm">Tasks Today</p>
        <p className="text-2xl font-bold text-blue-900">{data?.tasksToday || 0}</p>
      </div>
      <div className="bg-purple-50 border border-purple-200 p-4 rounded">
        <p className="text-purple-600 text-sm">Queue Length</p>
        <p className="text-2xl font-bold text-purple-900">{data?.queueLength || 0}</p>
      </div>
      <div className="bg-orange-50 border border-orange-200 p-4 rounded">
        <p className="text-orange-600 text-sm">Uptime</p>
        <p className="text-2xl font-bold text-orange-900">{data?.uptime || 'N/A'}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">📊 Dashboard</h1>
        <p className="text-gray-600">System Status & Integration Health</p>
      </div>

      <SystemHealthWidget />
      <QuickStats />
      <ConnectorStatus />

      <div className="bg-gray-50 border rounded p-6">
        <h3 className="font-bold mb-2">ℹ️ System Info</h3>
        <p className="text-sm text-gray-700">
          API: http://localhost:4000 • UI: http://localhost:5173 • Bot: @OurAccbot
        </p>
      </div>
    </div>
  );
}
```

---

## TESTING & VALIDATION

### Telegram Bot Testing
```bash
# Test 1: /start command
Send: /start
Expected: 8 interactive buttons appear

# Test 2: Button callbacks
Tap: "🔍 Job Search"
Expected: Submenu appears with job options

# Test 3: Message handling
Send: "Hello"
Expected: Message routed to Claude, response received

# Test 4: File upload
Send: Resume file (PDF)
Expected: File saved, status confirmation

# Test 5: Voice message
Send: Voice message
Expected: Transcribed and processed
```

### API Testing
```bash
# Test 1: Health check
curl http://localhost:4000/api/health
Expected: {"ok":true,"service":"ACC Module 7","time":"..."}

# Test 2: Dashboard data
curl http://localhost:4000/api/ui/dashboard
Expected: 200 OK with dashboard object

# Test 3: Approvals
curl http://localhost:4000/api/ui/approvals
Expected: 200 OK with approvals array

# Test 4: System health
curl http://localhost:4000/admin/system
Expected: 200 OK with connector status

# Test 5: Outreach CRM
curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"sheetCsvUrl":"YOUR_URL","maxLeads":2,"sink":"clickup"}'
Expected: 200 OK with pipeline results
```

### Dashboard Testing
```bash
# Test 1: Open dashboard
Open: http://localhost:5173
Expected: App.jsx loads, navigation visible

# Test 2: Dashboard page
Click: Dashboard tab
Expected: System status shows, connectors display correctly

# Test 3: Approvals page
Click: Approvals tab
Expected: Approval list loads (empty or with items)

# Test 4: Audit page
Click: Audit tab
Expected: Audit logs display (last 100 entries)
```

---

## DEPLOYMENT & MONITORING

### Production Startup
```bash
C:\Users\Shaya\agent-command-center\start-REDACTED.bat
```

**This script:**
- Kills stale processes
- Restarts PM2
- Waits for services to initialize
- Tests health every 30 seconds
- Auto-restarts if any service fails

### Monitoring
```bash
# View live logs
pm2 logs acc-server
pm2 logs acc-bot

# View process status
pm2 list
# Expected: acc-server ONLINE, acc-bot ONLINE

# View system health
curl http://localhost:4000/admin/system

# View dashboard
http://localhost:5173
```

### Recovery
If system crashes:
```bash
# Automatic (via start-REDACTED.bat)
→ Gets Telegram alert within 60 seconds
→ Services auto-restart
→ Recovery alert sent when back online

# Manual
taskkill /F /IM node.exe
pm2 kill
pm2 start pm2.config.js
```

---

## TEAM COORDINATION GUIDE

### For OpenAI Codex
**Task:** Tasks 1.1-1.5 (Telegram Bot Integration)
```bash
Files to modify:
- cloud/telegram/bot.js (main wiring)

Files to use:
- cloud/telegram/handlers.js (provided)
- cloud/telegram/buttons.js (provided)

Expected output: /start command shows 8 working buttons
Success metric: All button callbacks fire without error
```

### For Antigravity
**Task:** Tasks 2.1-2.5 (Dashboard UI Build)
```bash
Files to create:
- ui/src/hooks/useApi.js (NEW)
- ui/src/pages/Dashboard.jsx (NEW)
- ui/src/pages/Approvals.jsx (NEW)
- ui/src/pages/Audit.jsx (NEW)

Files to modify:
- ui/src/App.jsx (routing)

Expected output: http://localhost:5173 with 3 working pages
Success metric: All pages load and show data, no API errors
```

### For OpenHands
**Task:** Tasks 3.1-3.3 (Connector Fixes)
```bash
Files to modify:
- cloud/connectors/clickup.js (fix constructor)
- cloud/api/uiRoutes.js (add endpoints)

Expected output: All connectors return 200 OK
Success metric: ClickUp connector loads, Outreach endpoints respond
```

### For Alphonso
**Task:** Tasks 5.1-5.3 (Outreach Pipeline)
```bash
Files to create:
- cloud/workflows/accFullOutreachPipeline.js (NEW)

Files to modify:
- cloud/api/uiRoutes.js (register endpoints)
- Supabase (create acc_outreach_results table)

Expected output: Hunter → DeepSeek → Resend pipeline works
Success metric: Test leads bootstrap, emails generated, approvals work
```

### For Claude (Me)
**Task:** Tasks 4.1-4.3, 6.1-6.3, 7.1-7.4 (Database, Monitoring, Testing)
```bash
Create Supabase tables
Set up health monitoring
Create test suite
Run validation tests
```

---

## QUICK START FOR TEAM

### 1. Verify System Health
```bash
node C:\Users\Shaya\agent-command-center\test-health.js
# Expected: ✅ API Health Check: PASS
```

### 2. Start Production
```bash
C:\Users\Shaya\agent-command-center\start-REDACTED.bat
# Expected: Services online, monitoring active
```

### 3. Test Each Component
**Telegram:** Send /start to @OurAccbot  
**API:** curl http://localhost:4000/api/health  
**Dashboard:** Open http://localhost:5173  

### 4. Run Your Task
Each team member gets specific tasks (see Team Coordination Guide above)  
Report back when complete with success metrics  

### 5. Integration Test
```bash
pm2 logs
# Check for any errors

Send full test to @OurAccbot
# Test message handling

curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/bootstrap
# Test pipeline
```

---

## FILES SUMMARY

### Created Today (May 23)
✅ `cloud/telegram/handlers.js` (336 lines) - Callback implementation  
✅ `cloud/telegram/buttons.js` (103 lines) - Button definitions  
✅ `start-REDACTED.bat` - Startup & monitor script  
✅ `acc-monitor.js` - Health check monitor  
✅ `audit.js` - System audit tool  
✅ `AUDIT_REPORT_FULL.md` - Detailed audit  
✅ `ACC_V2_COMPLETE_MASTER_GUIDE.md` - This document  

### Locations
```
Local Repo:
C:\Users\Shaya\agent-command-center\

Key directories:
- cloud/              (Backend)
- cloud/telegram/     (Bot - handlers.js, buttons.js here)
- cloud/api/          (Routes)
- cloud/connectors/   (Integrations)
- cloud/workflows/    (Outreach pipeline)
- ui/src/             (Frontend - React)
- data/logs/          (Logs)
- data/vault/         (Secrets - encrypted)
```

### GitHub
```
Repo: https://github.com/Thatisshayan/ACC
Branch: safety/desktop-autostart-checkpoint
Latest commit: bded4a3
```

---

## SUCCESS CRITERIA

### All Tasks Complete = 100% Operational

| Component | Complete? | Metric |
|-----------|-----------|--------|
| Telegram Bot | ✅ | All 8 buttons work, callbacks fire |
| Dashboard UI | ✅ | All 3 pages load, show real data |
| Connectors | ✅ | 10/10 return 200 OK |
| Database | ✅ | Supabase tables created, data persists |
| Outreach Pipeline | ✅ | Hunter → DeepSeek → Resend flows end-to-end |
| Monitoring | ✅ | System auto-recovers from crash |
| Testing | ✅ | All test suites pass |

### Total Time: ~21 Hours
- Telegram Bot: 3.5h
- Dashboard UI: 6.5h
- Connectors: 2h
- Database: 45m
- Outreach Pipeline: 3.5h
- Monitoring: 1.5h
- Testing: 3.5h

**Realistic Timeline: 2-3 days with distributed team**

---

## DOCUMENT METADATA

**File:** `ACC_V2_COMPLETE_MASTER_GUIDE.md`  
**Location:** `C:\Users\Shaya\agent-command-center\`  
**Created:** May 23, 2026 02:58 UTC  
**Last Updated:** May 23, 2026 02:58 UTC  
**Status:** READY FOR EXECUTION  
**Team:** Shayan, OpenAI Codex, Antigravity, OpenHands, Alphonso  

---

**🚀 System is ONLINE and READY for distributed task execution.**

**Next Step:** Distribute tasks to team members and execute according to Task Breakdown section.

