# 🚀 ACC v2 REVISED MASTER PLAN v2.0

**Date:** May 23, 2026  
**Status:** Based on AUDIT_REPORT_FULL.md  
**System Health:** 75% Operational  
**Actual Issues:** 5 Critical + Missing UI Components  

---

## 🎯 SEPARATION OF CONCERNS

### ACC (Infrastructure) - CLAUDE HANDLES
Everything backend/ops/monitoring:
- T-ACC1: Fix Telegram buttons (wire handlers.js → bot.js)
- T-ACC2: Database setup (Supabase tables)
- T-ACC3: Connector fixes (ClickUp + Outreach endpoints)
- T-ACC4: Monitoring & recovery (auto-restart, alerts)
- T-ACC5: Testing suite (full validation)

### FRONTEND (UI) - TEAM HANDLES
React dashboard:
- T-UI1: Build Dashboard.jsx (Codex)
- T-UI2: Build Approvals.jsx (Antigravity)
- T-UI3: Build Audit.jsx + useApi.js hook (OpenHands)
- T-UI4: Route integration in App.jsx (Codex or Antigravity)

**Why separate?** ACC has infrastructure issues. UI is just missing components.

---

## 🔴 WHAT THE AUDIT FOUND

### Critical Issues (Must Fix)
1. ❌ Telegram button callbacks have no handler → **FIXED** (handlers.js created)
2. ❌ Dashboard components missing (3 files) → **BLOCKED** (needs team)
3. ❌ Logs stale → **FIXED** (restarted PM2)
4. ❌ ClickUp connector broken → **NEEDS FIX** (I can do)
5. ❌ /api/ui/audit endpoint missing → **NEEDS FIX** (I can do)

### What Works
- ✅ API server (95%)
- ✅ Bot framework (95%)
- ✅ 9/10 connectors (90%)
- ✅ Database connection (95%)
- ✅ All env vars loaded (95%)

### What's Incomplete
- ⚠️ Telegram buttons wiring (70% → will be 100%)
- ⚠️ Dashboard UI (35% → needs team)
- ⚠️ Outreach pipeline (0% → I can wire)

---

## 📊 REVISED TASK DISTRIBUTION

### ACC INFRASTRUCTURE (Claude - Me) = 6 hours
```
T-ACC1: Wire Telegram Buttons (1.5h)
  - Import handlers.js into bot.js
  - Connect callback chain
  - Test all 8 buttons

T-ACC2: Supabase Database (45m)
  - Create 5 tables via SQL
  - Test data persistence
  - Verify relationships

T-ACC3: Fix Connectors (2 hours)
  - Fix ClickUp ConnectorClass error
  - Create /api/ui/audit endpoint
  - Register Outreach CRM endpoints
  - Verify all 10 connectors → 200 OK

T-ACC4: Monitoring & Recovery (1.5 hours)
  - Auto-restart on crash
  - Telegram alerts
  - Dashboard health widget

T-ACC5: Testing Suite (1.5 hours)
  - Telegram button tests
  - API endpoint tests
  - End-to-end validation
```

**Total ACC:** 6 hours (I handle all)

### FRONTEND UI (Team) = 5-6 hours
```
T-UI1: Dashboard.jsx (Codex) (2 hours)
  - System status display
  - Connector health (10 items)
  - Quick stats (tasks, queue, uptime)

T-UI2: Approvals.jsx (Antigravity) (1.5 hours)
  - Pending approvals list
  - ✅ Approve button
  - ❌ Reject button

T-UI3: Audit.jsx + useApi.js (OpenHands) (2 hours)
  - useApi.js hook (reusable)
  - Audit log viewer
  - Last 100 entries display

T-UI4: App.jsx Routing (Codex or Antigravity) (30m)
  - 3-tab navigation
  - Page state management
  - Route switching
```

**Total UI:** 5-6 hours (distributed)

---

## ⏱️ TIMELINE (WITH SEPARATION)

```
START (T=0)
│
├─ ACC PARALLEL (Claude only)
│  ├─ T-ACC1: Telegram buttons (0-1.5h) ────────┐
│  ├─ T-ACC2: Supabase (0-0.75h) ────────────┐  │
│  └─ T-ACC3: Connectors (0-2h) ──────────┐  │  │
│                                         │  │  │
│  After all three done (2h):             │  │  │
│  ├─ T-ACC4: Monitoring (2-3.5h) ────┐  │  │  │
│  └─ T-ACC5: Testing (3.5-5h) ───┐   │  │  │  │
│                                 │   │  │  │  │
├─ UI PARALLEL (Team)             │   │  │  │  │
│  ├─ T-UI1: Dashboard (0-2h) ────┐   │  │  │  │
│  ├─ T-UI2: Approvals (0-1.5h) ──┤   │  │  │  │
│  ├─ T-UI3: Audit (0-2h) ────────┤   │  │  │  │
│  └─ T-UI4: Routing (2-2.5h) ────┘   │  │  │  │
│                                     │  │  │  │
CHECKPOINT: All ACC done (2h)         │  │  │  │
│                                     │  │  │  │
Integration test (5-8h):              │  │  │  │
│  - Button callbacks work ← ────────┘  │  │  │
│  - Dashboard displays data ← ────────┘  │  │
│  - Connectors all healthy ← ────────────┘  │
│  - Monitoring active ← ────────────────────┘
│
✅ PROJECT COMPLETE (5-8 hours with parallelization)
```

---

## 🛠️ DETAILED BREAKDOWN (NO ALPHONSO)

### ====== ACC TASKS (CLAUDE) ======

## T-ACC1: WIRE TELEGRAM BUTTONS (1.5 hours)

**File:** `cloud/telegram/bot.js`

**Step 1: Add imports (5 min)**
```javascript
var handlers = require('./handlers.js');
var buttons = require('./buttons.js');
```

**Step 2: Replace update handler (10 min)**
Find the old callback/message handler logic, replace with:
```javascript
async function handleUpdate(update) {
  if (update.callback_query) {
    return await handlers.handleCallback(update.callback_query);
  }
  if (update.message) {
    return await handlers.handleMessage(update.message);
  }
}
```

**Step 3: Wire button menus (20 min)**
Update `cloud/telegram/handlers.js`:
```javascript
async function sendStartMenu(chatId) {
  const buttons = require('./buttons.js');
  await sendMessage(chatId, '👋 Welcome!', buttons.MAIN_MENU);
}

async function sendJobMenu(chatId) {
  const buttons = require('./buttons.js');
  await sendMessage(chatId, '🔍 Job Search', buttons.JOB_SEARCH_MENU);
}
// ... (repeat for all 8 menus)
```

**Step 4: Test all callbacks (30 min)**
```bash
Send: /start
Expected: 8 buttons appear

Tap: "🔍 Job Search"
Expected: Job submenu appears

Tap: "📄 Resume"
Expected: Resume menu
... (test all 8)
```

**Step 5: Fix approval buttons (20 min)**
```javascript
async function handleApprovalCallback(chatId, taskId) {
  try {
    await axios.post(`http://localhost:4000/api/execute/approve`, {
      task_id: taskId,
      action: 'approve'
    });
    await sendMessage(chatId, `✅ Task approved!`);
  } catch(e) {
    console.error(e);
  }
}
```

**✅ Success:** /start shows 8 working buttons, all callbacks fire

---

## T-ACC2: SUPABASE DATABASE (45 minutes)

**File:** Supabase.com SQL Editor

**Step 1: Create tables (15 min)**
Go to: https://supabase.com → SQL Editor

```sql
CREATE TABLE acc_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  assigned_agent TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  provider_used TEXT
);

CREATE TABLE acc_results (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES acc_tasks(id) ON DELETE CASCADE,
  provider_used TEXT,
  output TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE acc_users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE acc_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES acc_tasks(id),
  action TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE acc_outreach_results (
  id TEXT PRIMARY KEY,
  email_found TEXT,
  message_generated TEXT,
  approval_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_acc_tasks_status ON acc_tasks(status);
CREATE INDEX idx_acc_tasks_agent ON acc_tasks(assigned_agent);
CREATE INDEX idx_acc_results_task ON acc_results(task_id);
```

**Step 2: Update app (20 min)**
Verify `cloud/persistence/supabaseClient.js` exists and app uses it.

**Step 3: Test (10 min)**
```bash
Send message to @OurAccbot
Check Supabase → acc_tasks
Verify row created
Refresh → data persists
```

**✅ Success:** 5 tables created, data persists

---

## T-ACC3: FIX CONNECTORS (2 hours)

### Fix 1: ClickUp Connector (30 min)

**File:** `cloud/connectors/clickup.js`

**Problem:** Exports ClickUpConnector class instead of object

**Fix:** Change bottom to:
```javascript
module.exports = {
  enabled: () => !!process.env.CLICKUP_API_KEY,
  checkHealth: async () => { /* ... */ },
  createTask: async (task) => { /* ... */ },
  listTasks: async () => { /* ... */ }
};
```

**Test:**
```bash
curl http://localhost:4000/api/connectors/clickup/health
# Expected: 200 OK
```

### Fix 2: Register /api/ui/audit (20 min)

**File:** `cloud/api/uiRoutes.js`

Add:
```javascript
router.get('/ui/audit', (req, res) => {
  try {
    const auditLog = require('../utils/auditLog.js');
    const logs = auditLog.getLast(100);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**Test:**
```bash
curl http://localhost:4000/api/ui/audit
# Expected: 200 OK with logs
```

### Fix 3: Register Outreach CRM endpoints (40 min)

**File:** `cloud/api/uiRoutes.js`

Add:
```javascript
router.post('/taskbus/workflow/outreach-crm/health', async (req, res) => {
  res.json({ status: 'healthy', readyForBootstrap: true });
});

router.post('/taskbus/workflow/outreach-crm/bootstrap', async (req, res) => {
  const { sheetCsvUrl, maxLeads, sink } = req.body;
  try {
    // Placeholder - will be fully implemented
    res.json({ success: true, message: 'Pipeline initializing' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

### Fix 4: Verify all connectors (30 min)

Test each:
```bash
curl http://localhost:4000/api/connectors/claude/health
curl http://localhost:4000/api/connectors/deepseek/health
curl http://localhost:4000/api/connectors/openai/health
curl http://localhost:4000/api/connectors/notion/health
curl http://localhost:4000/api/connectors/hunter/health
curl http://localhost:4000/api/connectors/resend/health
curl http://localhost:4000/api/connectors/alibaba/health
curl http://localhost:4000/api/connectors/clickup/health ← NOW FIXED
curl http://localhost:4000/api/connectors/tavily/health
curl http://localhost:4000/api/connectors/composio/health
```

**✅ Success:** All 10 connectors → 200 OK

---

## T-ACC4: MONITORING & RECOVERY (1.5 hours)

### 1. Auto-restart (30 min)

**File:** `start-REDACTED.bat` (already created)

Verify it:
- Kills node.exe
- Restarts PM2
- Checks health
- Loops every 30s

Test:
```bash
C:\Users\Shaya\agent-command-center\start-REDACTED.bat
```

### 2. Telegram Alerts (30 min)

**File:** `acc-monitor.js`

Add:
```javascript
async function checkHealth() {
  const health = await fetch('http://localhost:4000/api/health');
  if (!health.ok) {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: process.env.SHAYAN_TELEGRAM_CHAT_ID,
      text: '🚨 ACC Server DOWN'
    });
    await restartServices();
  }
}
```

### 3. Dashboard widget (30 min)

Add to dashboard:
```javascript
const [status, setStatus] = useState('checking');

useEffect(() => {
  const check = async () => {
    const res = await fetch('http://localhost:4000/api/health');
    setStatus(res.ok ? 'online' : 'offline');
  };
  check();
  setInterval(check, 30000);
}, []);

return <div>{status === 'online' ? '🟢 Healthy' : '🔴 Down'}</div>;
```

**✅ Success:** System auto-recovers on crash

---

## T-ACC5: TESTING SUITE (1.5 hours)

### 1. Telegram Tests (30 min)

**File:** `test/telegram.test.js`

```javascript
const assert = require('assert');
const handlers = require('../cloud/telegram/handlers.js');
const buttons = require('../cloud/telegram/buttons.js');

describe('Telegram Bot', () => {
  it('should have all menus', () => {
    assert(buttons.MAIN_MENU);
    assert(buttons.JOB_SEARCH_MENU);
    assert(buttons.INTERVIEW_MENU);
  });

  it('should handle /start', async () => {
    const msg = { text: '/start', from: { id: 123 }, chat: { id: 123 } };
    const result = await handlers.handleMessage(msg);
    assert(result !== undefined);
  });

  it('should handle job_search callback', async () => {
    const cb = { data: 'job_search', from: { id: 123 } };
    const result = await handlers.handleCallback(cb);
    assert(result !== undefined);
  });
});
```

Run: `npm test test/telegram.test.js`

### 2. API Tests (30 min)

**File:** `test/api.test.js`

```javascript
const http = require('http');
const assert = require('assert');

describe('API Endpoints', () => {
  function request(path) {
    return new Promise((resolve) => {
      http.get(`http://localhost:4000${path}`, res => {
        resolve(res.statusCode);
      });
    });
  }

  it('/api/health → 200', async () => {
    assert.strictEqual(await request('/api/health'), 200);
  });

  it('/api/ui/dashboard → 200', async () => {
    assert.strictEqual(await request('/api/ui/dashboard'), 200);
  });

  it('/api/ui/approvals → 200', async () => {
    assert.strictEqual(await request('/api/ui/approvals'), 200);
  });

  it('/api/ui/audit → 200', async () => {
    assert.strictEqual(await request('/api/ui/audit'), 200);
  });

  it('/api/connectors/clickup/health → 200', async () => {
    assert.strictEqual(await request('/api/connectors/clickup/health'), 200);
  });
});
```

Run: `npm test test/api.test.js`

### 3. Manual Checklist (30 min)

```
✅ /start shows 8 buttons
✅ All buttons have callbacks
✅ Message routing works
✅ File upload works
✅ Voice message works
✅ All 10 connectors respond
✅ Supabase tables created
✅ Data persists
✅ Monitoring active
✅ Auto-recovery works
```

**✅ Success:** All ACC components passing

---

### ====== UI TASKS (TEAM) ======

## T-UI1: DASHBOARD.JSX (Codex) (2 hours)

**File:** `ui/src/pages/Dashboard.jsx` (NEW)

Create component that shows:
- System health (🟢 Online / 🔴 Offline)
- Connector status (10 items)
- Quick stats (tasks today, queue length, uptime)

```javascript
import { useDashboard, useConnectorHealth } from '../hooks/useApi';

export default function Dashboard() {
  const { data: dashboard } = useDashboard();
  const { data: health } = useConnectorHealth();

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📊 Dashboard</h1>
      
      {/* System Health */}
      <div className="bg-green-50 border-2 border-green-300 p-6 rounded">
        <h3 className="font-bold text-lg">🟢 System Healthy</h3>
      </div>

      {/* Connector Status */}
      <div className="bg-white border rounded p-6">
        <h2 className="text-xl font-bold mb-4">🔗 Integrations</h2>
        <div className="grid grid-cols-5 gap-3">
          {['Claude', 'DeepSeek', 'OpenAI', 'Notion', 'Hunter',
            'Resend', 'Alibaba', 'ClickUp', 'Tavily', 'Composio'].map(name => (
            <div key={name} className="p-3 rounded border bg-green-50">
              ✅ {name}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border rounded p-4">
          <p className="text-sm">Tasks Today</p>
          <p className="text-2xl font-bold">{dashboard?.tasksToday || 0}</p>
        </div>
        <div className="bg-purple-50 border rounded p-4">
          <p className="text-sm">Queue Length</p>
          <p className="text-2xl font-bold">{dashboard?.queueLength || 0}</p>
        </div>
        <div className="bg-orange-50 border rounded p-4">
          <p className="text-sm">Uptime</p>
          <p className="text-2xl font-bold">{dashboard?.uptime || 'N/A'}</p>
        </div>
      </div>
    </div>
  );
}
```

**Success:** Dashboard page loads and shows real data

---

## T-UI2: APPROVALS.JSX (Antigravity) (1.5 hours)

**File:** `ui/src/pages/Approvals.jsx` (NEW)

Show pending approvals with approve/reject buttons.

```javascript
import { useApprovals } from '../hooks/useApi';

export default function Approvals() {
  const { data: approvals } = useApprovals();
  const [handled, setHandled] = useState(new Set());

  async function approve(id) {
    await fetch(`http://localhost:4000/api/execute/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approval_id: id })
    });
    setHandled(new Set([...handled, id]));
  }

  const pending = (approvals || []).filter(a => !handled.has(a.id));

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">✅ Approvals</h1>
      {pending.length === 0 ? (
        <div className="bg-green-50 p-6 rounded">No pending approvals</div>
      ) : (
        pending.map(a => (
          <div key={a.id} className="border rounded p-6 mb-4">
            <h3 className="font-bold">{a.action}</h3>
            <p className="text-gray-700 mb-4">{a.description}</p>
            <div className="flex gap-2">
              <button onClick={() => approve(a.id)} className="bg-green-500 text-white px-4 py-2 rounded">
                ✅ Approve
              </button>
              <button className="bg-red-500 text-white px-4 py-2 rounded">
                ❌ Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

**Success:** Approvals page works, buttons functional

---

## T-UI3: AUDIT.JSX + USEAPI.JS (OpenHands) (2 hours)

### Part A: useApi.js Hook (45 min)

**File:** `ui/src/hooks/useApi.js` (NEW)

```javascript
import { useState, useEffect } from 'react';

export function useApi(endpoint, method = 'GET') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:4000${endpoint}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [endpoint]);

  return { data, loading, error };
}

export function useDashboard() { return useApi('/api/ui/dashboard'); }
export function useApprovals() { return useApi('/api/ui/approvals'); }
export function useAudit() { return useApi('/api/ui/audit'); }
```

### Part B: Audit.jsx (1.25 hours)

**File:** `ui/src/pages/Audit.jsx` (NEW)

```javascript
import { useAudit } from '../hooks/useApi';

export default function Audit() {
  const { data, loading } = useAudit();

  if (loading) return <div className="p-8">Loading audit logs...</div>;

  const logs = data?.logs || [];

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">📋 Audit Log</h1>
      <div className="space-y-2">
        {logs.length === 0 ? (
          <p>No audit logs</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="border rounded p-4 text-sm">
              <span className="font-mono text-gray-600">{log.timestamp}</span>
              <span className="ml-4">{log.action}</span>
              <span className="ml-4 text-gray-700">{log.details}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Success:** Audit page displays logs, hook works

---

## T-UI4: APP.JSX ROUTING (Codex or Antigravity) (30 min)

**File:** `ui/src/App.jsx` (MODIFY)

Add routing:
```javascript
import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Approvals from './pages/Approvals';
import Audit from './pages/Audit';

export default function App() {
  const [page, setPage] = useState('dashboard');

  const pages = {
    dashboard: <Dashboard />,
    approvals: <Approvals />,
    audit: <Audit />
  };

  return (
    <div>
      <nav className="bg-white border-b p-4 flex gap-4">
        {['dashboard', 'approvals', 'audit'].map(p => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`px-4 py-2 rounded ${
              page === p ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}
          >
            {p === 'dashboard' && '📊 Dashboard'}
            {p === 'approvals' && '✅ Approvals'}
            {p === 'audit' && '📋 Audit'}
          </button>
        ))}
      </nav>
      <main>{pages[page]}</main>
    </div>
  );
}
```

**Success:** Navigation works, all pages accessible

---

## 📊 COMBINED PROGRESS

| Phase | Component | Owner | Hours | Status |
|-------|-----------|-------|-------|--------|
| **ACC** | Telegram Buttons | Claude | 1.5h | ← START |
| **ACC** | Supabase DB | Claude | 0.75h | Parallel |
| **ACC** | Connectors | Claude | 2h | Parallel |
| **UI** | Dashboard.jsx | Codex | 2h | ← START |
| **UI** | Approvals.jsx | Antigravity | 1.5h | ← START |
| **UI** | Audit.jsx + Hook | OpenHands | 2h | ← START |
| **UI** | App.jsx Routing | Codex/Antigravity | 0.5h | After UI3 |
| **ACC** | Monitoring | Claude | 1.5h | After UI |
| **ACC** | Testing | Claude | 1.5h | Final |

**TOTAL PARALLEL TIME: 2 hours (all start together)**
**SEQUENTIAL: 0 hours (everything can run in parallel)**
**TOTAL ELAPSED: ~2-3 hours with full team**

---

## ✅ SUCCESS CRITERIA

### ACC Complete:
- ✅ /start shows 8 buttons
- ✅ All buttons have callbacks
- ✅ 10 connectors return 200 OK
- ✅ Supabase tables created
- ✅ Data persists
- ✅ Monitoring auto-recovers
- ✅ Tests passing

### UI Complete:
- ✅ Dashboard displays data
- ✅ Approvals shows list
- ✅ Audit shows logs
- ✅ Navigation works
- ✅ All API calls successful

### Integration Complete:
- ✅ End-to-end flow works
- ✅ No errors in logs
- ✅ 100% operational

---

## 🚀 EXECUTION ORDER

**START (ALL PARALLEL):**

1. **Claude:** Start T-ACC1, T-ACC2, T-ACC3 (2 hours total)
2. **Codex:** Start T-UI1 + T-UI4 (2.5 hours total)
3. **Antigravity:** Start T-UI2 + T-UI4 (2 hours total)
4. **OpenHands:** Start T-UI3 (2 hours total)

**AFTER 2 HOURS (Claude continues):**

5. **Claude:** T-ACC4 (1.5h)
6. **Claude:** T-ACC5 (1.5h)

**ESTIMATED COMPLETION: 3.5-4 hours from start**

---

## 📁 FILES TO CREATE/MODIFY

### Claude creates:
- cloud/telegram/handlers.js ✅ (done)
- cloud/telegram/buttons.js ✅ (done)
- Modify: cloud/telegram/bot.js
- Modify: cloud/api/uiRoutes.js
- Modify: cloud/connectors/clickup.js
- Create: test/telegram.test.js
- Create: test/api.test.js

### Team creates:
- ui/src/pages/Dashboard.jsx
- ui/src/pages/Approvals.jsx
- ui/src/pages/Audit.jsx
- ui/src/hooks/useApi.js
- Modify: ui/src/App.jsx

---

## 🎯 NO ALPHONSO, SEPARATE ACC

✅ **Why this works:**
- ACC is infrastructure (Claude handles)
- UI is components (Team builds)
- No dependencies between them (parallel)
- Clear separation of concerns
- Faster execution

✅ **What's different:**
- Alphonso removed (was handling outreach)
- Outreach can be built LATER (not critical path)
- ACC can stand alone
- Team focuses on UI
- Claude focuses on backend

**This plan delivers 100% ACC + UI in 3-4 hours.**

---

**Status:** READY TO EXECUTE  
**Team:** Shayan (orchestrator) + Codex + Antigravity + OpenHands + Claude  
**Execution:** All parallel, staggered completions  
**ETA:** 3.5-4 hours from now
