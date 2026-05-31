# 🎨 TASK BRIEF: Antigravity - Dashboard UI Build

**Project:** ACC v2 - 100% Completion  
**Your Task:** T2 - React Dashboard Construction  
**Duration:** 6.5 Hours  
**Difficulty:** Hard (but fun)  
**Status:** 🟡 READY TO START

---

## 📌 YOUR MISSION

Build the React dashboard (3 pages) that shows ACC system status, approvals, and audit logs.

**Current State:** App.jsx exists but is empty.  
**Your Job:** Create 4 new components + wire routing.  
**Success:** http://localhost:5173 shows real data from API.

---

## 🎯 WHAT YOU'LL BUILD

### Component 1: useApi.js Hook (45 min)
**File:** `ui/src/hooks/useApi.js` (NEW)

```javascript
import { useState, useEffect } from 'react';

export function useApi(endpoint, method = 'GET', body = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(`http://localhost:4000${endpoint}`, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  }, [endpoint]);

  return { data, loading, error };
}

// Convenience hooks
export function useDashboard() { return useApi('/api/ui/dashboard'); }
export function useApprovals() { return useApi('/api/ui/approvals'); }
export function useAudit() { return useApi('/api/ui/audit'); }
```

### Component 2: Dashboard.jsx (90 min)
**File:** `ui/src/pages/Dashboard.jsx` (NEW)

Displays:
- System health status (green/red)
- Connector status (10 connectors)
- Quick stats (tasks, queue, uptime)

### Component 3: Approvals.jsx (60 min)
**File:** `ui/src/pages/Approvals.jsx` (NEW)

Displays:
- List of pending approvals
- ✅ Approve button (calls API)
- ❌ Reject button (calls API)

### Component 4: Audit.jsx (45 min)
**File:** `ui/src/pages/Audit.jsx` (NEW)

Displays:
- Last 100 audit log entries
- Timestamp, action, result

### Component 5: Update App.jsx (30 min)
**File:** `ui/src/App.jsx` (MODIFY)

Add:
- Navigation tabs (Dashboard | Approvals | Audit)
- Route state
- Page switching logic

---

## 📁 FILES YOU'LL CREATE

1. ✅ `ui/src/hooks/useApi.js` - Reusable API hook
2. ✅ `ui/src/pages/Dashboard.jsx` - System status
3. ✅ `ui/src/pages/Approvals.jsx` - Approval UI
4. ✅ `ui/src/pages/Audit.jsx` - Audit log viewer
5. 🔧 `ui/src/App.jsx` - Update with routing

---

## 🚀 BUILD PROCESS

```bash
cd ui
npm install  # If needed
npm run dev
# Open http://localhost:5173
```

Then implement components one by one, test each.

---

## ✅ SUCCESS CHECKLIST

- [ ] useApi.js hook created
- [ ] Dashboard.jsx displays status
- [ ] Approvals.jsx shows list
- [ ] Audit.jsx shows logs
- [ ] App.jsx has 3-tab navigation
- [ ] npm run dev works
- [ ] http://localhost:5173 loads
- [ ] All data from real API calls
- [ ] No console errors
- [ ] All pages responsive

**Time:** 6.5 hours  
**Result:** Full interactive dashboard

---

## 🆘 COMMON ISSUES

**"Cannot GET /api/ui/dashboard"?**
→ Claude needs to create the endpoint. Ask to verify it exists.

**React not loading?**
→ `npm install`, then `npm run dev`

**Connectors showing as "disabled"?**
→ That's a UI display issue. API is working, just display the status correctly.

---

## 🎨 DESIGN HINTS

- Use Tailwind for styling (already in project)
- Keep it clean and simple
- Show real data from APIs
- Use loading states (spinners)
- Show errors clearly

---

## 🚀 WHEN COMPLETE

1. Notify Shayan: "T2 Complete - Dashboard ready"
2. T6 (Monitoring) can now start
3. T7 will test your dashboard

**Estimated completion:** +6.5 hours from now
