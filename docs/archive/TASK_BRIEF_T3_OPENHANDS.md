# 🔧 TASK BRIEF: OpenHands - Connector Fixes

**Project:** ACC v2 - 100% Completion  
**Your Task:** T3 - Fix Broken Connectors  
**Duration:** 2 Hours  
**Difficulty:** Easy-Medium  
**Status:** 🟡 READY TO START

---

## 📌 YOUR MISSION

Fix 1 broken connector + create 2 missing API endpoints.

**Current State:** 9/10 connectors work. ClickUp broken. Outreach endpoint 404.  
**Your Job:** Fix both.  
**Success:** All 10 connectors + 2 endpoints return 200 OK.

---

## 🎯 WHAT YOU'LL DO

### Task 3.1: Fix ClickUp Connector (20 min)
**File:** `cloud/connectors/clickup.js`

**Problem:** Exports a class instead of functions.

**Fix:** Change bottom of file from:
```javascript
module.exports = ClickUpConnector; // ❌ WRONG
```

To:
```javascript
module.exports = {
  enabled: () => !!process.env.CLICKUP_API_KEY,
  checkHealth: async () => { /* implementation */ },
  createTask: async (task) => { /* implementation */ },
  listTasks: async () => { /* implementation */ },
  updateTask: async (id, update) => { /* implementation */ }
};
```

**Test:**
```bash
curl http://localhost:4000/api/connectors/clickup/health
# Expected: 200 OK
```

### Task 3.2: Register Outreach CRM Endpoints (30 min)
**File:** `cloud/api/uiRoutes.js`

Add these routes:
```javascript
router.post('/taskbus/workflow/outreach-crm/health', async (req, res) => {
  try {
    res.json({ status: 'healthy', readyForBootstrap: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/taskbus/workflow/outreach-crm/bootstrap', async (req, res) => {
  const { sheetCsvUrl, maxLeads, sink } = req.body;
  try {
    // TODO: Call outreach pipeline here
    res.json({ success: true, message: 'Bootstrap initiated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**Test:**
```bash
curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/health
# Expected: 200 OK
```

### Task 3.3: Register /api/ui/audit Endpoint (15 min)
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
# Expected: 200 OK with array of logs
```

### Task 3.4: Verify All Connectors (30 min)

Test each connector:
```bash
curl http://localhost:4000/api/connectors/claude/health
curl http://localhost:4000/api/connectors/deepseek/health
curl http://localhost:4000/api/connectors/openai/health
curl http://localhost:4000/api/connectors/notion/health
curl http://localhost:4000/api/connectors/hunter/health
curl http://localhost:4000/api/connectors/resend/health
curl http://localhost:4000/api/connectors/alibaba/health
curl http://localhost:4000/api/connectors/clickup/health  # NOW FIXED
curl http://localhost:4000/api/connectors/tavily/health
curl http://localhost:4000/api/connectors/composio/health
```

**Expected:** All return 200 OK

---

## 📁 FILES YOU'LL MODIFY

1. 🔧 `cloud/connectors/clickup.js` - Change export format
2. 🔧 `cloud/api/uiRoutes.js` - Add 3 routes

---

## ✅ SUCCESS CHECKLIST

- [ ] ClickUp.js module exports object
- [ ] Outreach health endpoint responds
- [ ] Outreach bootstrap endpoint responds
- [ ] /api/ui/audit endpoint responds
- [ ] All 10 connectors return 200 OK
- [ ] No errors in pm2 logs
- [ ] Server still runs (didn't break anything)

**Time:** 2 hours  
**Result:** All connectors healthy + 2 new endpoints

---

## 🆘 IF STUCK

**"Cannot find module"?**
→ Check the require path in uiRoutes.js

**"Syntax error"?**
→ Use a linter: `npx eslint cloud/api/uiRoutes.js`

**Still getting 404?**
→ Did you restart the server? `pm2 restart acc-server`

---

## 🚀 WHEN COMPLETE

1. Notify Shayan: "T3 Complete - All connectors fixed"
2. Alphonso can now start T5 (needs these endpoints)
3. Claude will run full tests on your endpoints

**Estimated completion:** +2 hours from now
