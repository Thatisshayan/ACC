# 🤖 TASK BRIEF: Codex - Telegram Bot Integration

**Project:** ACC v2 - 100% Completion  
**Your Task:** T1 - Telegram Bot Wiring  
**Duration:** 3.5 Hours  
**Difficulty:** Medium  
**Status:** 🟡 READY TO START

---

## 📌 YOUR MISSION

Wire the Telegram bot button callbacks so that when users tap buttons in @OurAccbot, the system routes them to the right handlers.

**Current State:** Bot exists, handlers exist, but they're not connected.  
**Your Job:** Connect them.  
**Success:** User taps "Job Search" → System responds with job menu.

---

## 🎯 WHAT YOU'LL DO

### Subtask 1.1: Import Handlers (45 minutes)
**File:** `cloud/telegram/bot.js`

1. Add at top (after line 20):
   ```javascript
   var handlers = require('./handlers.js');
   var buttons = require('./buttons.js');
   ```

2. Find main update loop (around line 700), replace with:
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

3. Restart: `pm2 restart acc-bot`

### Subtask 1.2: Wire Button Menus (30 minutes)
**File:** `cloud/telegram/handlers.js`

Update these functions to use buttons from buttons.js:
- `sendStartMenu()` → use `buttons.MAIN_MENU`
- `sendJobMenu()` → use `buttons.JOB_SEARCH_MENU`
- `sendResumeMenu()` → use `buttons.RESUME_MENU`
- etc.

### Subtask 1.3: Test All Callbacks (30 minutes)
**Test:** Send `/start` to @OurAccbot
- [ ] 8 buttons appear
- [ ] Tap "🔍 Job Search" → callback fires
- [ ] Tap "📄 Resume" → submenu appears
- [ ] Tap "🎯 Interview" → submenu appears
- [ ] Tap "💼 Salary" → submenu appears
- [ ] Check logs: No errors

### Subtask 1.4: Approval Buttons (20 minutes)
**File:** `cloud/telegram/handlers.js`

Fix approval handlers to match API:
```javascript
async function handleApprovalCallback(chatId, taskId) {
  try {
    await axios.post(`http://localhost:4000/api/execute/approve`, {
      task_id: taskId,
      user_id: chatId,
      action: 'approve'
    });
    await sendMessage(chatId, `✅ Task ${taskId} approved!`);
  } catch(e) {
    console.error(e);
  }
}
```

### Subtask 1.5: Add Missing Commands (15 minutes)
**File:** `cloud/telegram/handlers.js`

Add to handleCommand():
```javascript
'/image': () => sendMessage(chat.id, '🎨 Send me text and I\'ll generate'),
'/generate': () => sendMessage(chat.id, '🎬 Describe what to create'),
'/research': () => sendMessage(chat.id, '🔎 What topic?'),
```

---

## 📁 FILES YOU NEED

**Read (Don't modify):**
- ✅ `cloud/telegram/handlers.js` - Already created for you
- ✅ `cloud/telegram/buttons.js` - Already created for you

**Modify:**
- 🔧 `cloud/telegram/bot.js` - Where you wire them

**Check:**
- 📋 `ACC_V2_COMPLETE_MASTER_GUIDE.md` - Full reference

---

## ✅ SUCCESS CHECKLIST

- [ ] Imports added to bot.js
- [ ] Update handler replaces inline logic
- [ ] Bot restarted
- [ ] /start sends 8 buttons
- [ ] All button taps work
- [ ] Approval buttons work
- [ ] New commands added
- [ ] No errors in pm2 logs

**Time:** 3.5 hours  
**Result:** Telegram bot fully interactive

---

## 🆘 BLOCKERS?

If stuck:
1. Check `pm2 logs acc-bot` for errors
2. Look at handlers.js to understand function signatures
3. Ask Claude if handlers.js needs adjustment
4. Don't proceed to next task until buttons work

---

## 🚀 WHEN COMPLETE

1. Notify Shayan: "T1 Complete - Telegram bot ready"
2. Move on (T2, T3, T5 can start immediately)
3. Claude will use your working bot for T6 testing

**Estimated completion:** +3.5 hours from now
