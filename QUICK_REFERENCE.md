# ⚡ QUICK REFERENCE - TASK ASSIGNMENTS v2.0

**No Alphonso. Separate ACC. 3-4 hours total.**

---

## 🧠 CLAUDE (Me) - 6 HOURS OF ACC INFRASTRUCTURE

### T-ACC1: Wire Telegram Buttons (1.5h)
**File:** `cloud/telegram/bot.js`

```javascript
// Add at top:
var handlers = require('./handlers.js');
var buttons = require('./buttons.js');

// Replace update handler with:
async function handleUpdate(update) {
  if (update.callback_query) return await handlers.handleCallback(update.callback_query);
  if (update.message) return await handlers.handleMessage(update.message);
}
```

✅ **Success:** /start → 8 buttons appear

---

### T-ACC2: Supabase Database (45m)
**Go to:** https://supabase.com → SQL Editor

Paste SQL from MASTER_PLAN_v2.0.md (5 tables)

✅ **Success:** Tables created, test data persists

---

### T-ACC3: Fix Connectors (2h)
**File:** `cloud/api/uiRoutes.js`

1. Fix ClickUp export (change to object not class)
2. Add /api/ui/audit endpoint
3. Add /api/taskbus/workflow/outreach-crm/health
4. Add /api/taskbus/workflow/outreach-crm/bootstrap

✅ **Success:** All 10 connectors return 200 OK

---

### T-ACC4: Monitoring (1.5h)
**Files:** `acc-monitor.js` + `ui/src/pages/Dashboard.jsx`

- Auto-restart on crash
- Telegram alerts
- Dashboard health widget

✅ **Success:** Kill node.exe → Telegram alert → Auto-restart

---

### T-ACC5: Testing (1.5h)
**Files:** `test/telegram.test.js` + `test/api.test.js`

- Test all buttons work
- Test all API endpoints respond
- Manual checklist

✅ **Success:** `npm test` passes

---

## 🎨 CODEX - 2.5 HOURS OF UI

### T-UI1: Dashboard.jsx (2h)
**File:** `ui/src/pages/Dashboard.jsx` (NEW)

Display:
- System health (🟢 Online)
- 10 connector status boxes
- 3 stats (tasks, queue, uptime)

Use: `useDashboard()` + `useConnectorHealth()` hooks

✅ **Success:** Shows real API data

---

### T-UI4: App.jsx Routing (30m)
**File:** `ui/src/App.jsx` (MODIFY)

Add:
- Navigation tabs (Dashboard | Approvals | Audit)
- Page state
- Route to pages

✅ **Success:** Can switch between 3 tabs

---

## 🌈 ANTIGRAVITY - 2 HOURS OF UI

### T-UI2: Approvals.jsx (1.5h)
**File:** `ui/src/pages/Approvals.jsx` (NEW)

Display:
- List of pending approvals
- ✅ Approve button (calls API)
- ❌ Reject button (calls API)

Use: `useApprovals()` hook

✅ **Success:** Can approve/reject items

---

### T-UI4: App.jsx Routing (30m)
*Can share with Codex - both work on this*

---

## 🔧 OPENHANDS - 2 HOURS OF UI

### T-UI3: Audit.jsx + useApi.js (2h)

**Part A: useApi.js Hook (45m)**
**File:** `ui/src/hooks/useApi.js` (NEW)

```javascript
export function useApi(endpoint) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch(`http://localhost:4000${endpoint}`)
      .then(r => r.json())
      .then(setData);
  }, [endpoint]);
  
  return { data, loading };
}

export function useAudit() { return useApi('/api/ui/audit'); }
export function useDashboard() { return useApi('/api/ui/dashboard'); }
export function useApprovals() { return useApi('/api/ui/approvals'); }
```

**Part B: Audit.jsx (1.25h)**
**File:** `ui/src/pages/Audit.jsx` (NEW)

Display: Last 100 audit log entries with timestamps

Use: `useAudit()` hook

✅ **Success:** Shows audit logs with real data

---

## 🚀 EXECUTION ORDER

**START (All parallel):**

```
T=0:00
├─ Claude starts T-ACC1, T-ACC2, T-ACC3
├─ Codex starts T-UI1 + T-UI4
├─ Antigravity starts T-UI2 + T-UI4
└─ OpenHands starts T-UI3

T=0:45 (Claude milestone)
└─ T-ACC2 done → Supabase ready

T=1:30 (Codex milestone)
└─ T-UI1 done → Dashboard ready

T=1:50 (OpenHands milestone)
└─ T-UI3 done → Audit + hook ready

T=2:00
├─ All UI components done
└─ Claude continues T-ACC4 (monitoring)

T=2:00 (Antigravity milestone)
└─ T-UI2 done → Approvals ready

T=2:00 (Combined milestone)
├─ All UI done
└─ T-UI4 done → Routing done

T=2:30 (Claude milestone)
├─ T-ACC1 done → Buttons wired
├─ T-ACC3 done → Connectors fixed
└─ T-ACC4 starts → Monitoring

T=3:30
├─ T-ACC4 done → Monitoring active
└─ T-ACC5 starts → Testing

T=4:00
└─ ✅ ALL COMPLETE
```

**Expected Total Time: 3.5-4 hours**

---

## ✅ SUCCESS CRITERIA

| Task | Pass Condition |
|------|---|
| T-ACC1 | /start → 8 buttons |
| T-ACC2 | Data in Supabase |
| T-ACC3 | All 10 connectors → 200 |
| T-ACC4 | Auto-restart on crash |
| T-ACC5 | Tests pass |
| T-UI1 | Dashboard shows data |
| T-UI2 | Approvals work |
| T-UI3 | Audit displays logs |
| T-UI4 | Navigation switches pages |

**Final: Everything works end-to-end** ✅

---

## 📞 IF STUCK

1. Check MASTER_PLAN_v2.0.md for full details
2. Ask Claude immediately
3. Skip non-critical subtasks
4. Keep moving

---

## FILES READY TO GO

✅ Handlers created: `cloud/telegram/handlers.js`  
✅ Buttons created: `cloud/telegram/buttons.js`  
✅ Monitor ready: `acc-monitor.js`  
✅ Master plan: `MASTER_PLAN_v2.0.md`  
✅ This brief: `QUICK_REFERENCE.md`  

---

**Status:** READY TO EXECUTE  
**Team:** 4 people  
**Time:** 3.5-4 hours  
**Start:** NOW

🎉 **Let's build!**
