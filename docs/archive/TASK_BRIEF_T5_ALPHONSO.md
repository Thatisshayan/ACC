# 🚀 TASK BRIEF: Alphonso - Outreach Pipeline

**Project:** ACC v2 - 100% Completion  
**Your Task:** T5 - Build Hunter → DeepSeek → Resend Pipeline  
**Duration:** 3.5 Hours  
**Difficulty:** Hard  
**Status:** 🟡 READY TO START (after T3 complete)

---

## 📌 YOUR MISSION

Build the automated outreach pipeline that:
1. Takes leads from a Google Sheet
2. Finds their email via Hunter
3. Generates personalized message via DeepSeek
4. Queues email via Resend
5. Handles approvals
6. Logs results to Supabase

**Current State:** Connectors exist separately. Not connected.  
**Your Job:** Wire them into one pipeline.  
**Success:** Full end-to-end flow from lead to email approval.

---

## 🎯 WHAT YOU'LL BUILD

### Create: accFullOutreachPipeline.js (NEW)

**File:** `cloud/workflows/accFullOutreachPipeline.js`

Main function signature:
```javascript
async function runOutreachPipeline(leads, options = {}) {
  const results = { processed: 0, emailsFound: 0, emailsSent: 0, errors: [] };

  for (const lead of leads) {
    // Step 1: Find email via Hunter
    const emailResult = await hunter.findEmail(lead.domain, lead.firstName, lead.lastName);
    if (!emailResult.success) {
      results.errors.push(`No email for ${lead.firstName}`);
      continue;
    }
    results.emailsFound++;

    // Step 2: Generate message via DeepSeek
    const prompt = `Write outreach email to ${lead.firstName} at ${lead.company}...`;
    const emailBody = await deepseek.sendTask({ instruction: prompt });

    // Step 3: Queue via Resend
    await resend.sendEmail({
      to: emailResult.email,
      subject: `${lead.topic || 'Partnership'} opportunity`,
      html: emailBody,
      approval_required: true
    });
    results.emailsSent++;
  }

  return results;
}
```

Also export:
```javascript
async function bootstrap(csvUrl, maxLeads, sink) {
  // Fetch CSV from Google Sheets
  // Parse leads
  // Run pipeline
  // Mirror results to Airtable/ClickUp if requested
  return { success: true, results };
}
```

---

## 📁 STRUCTURE

```
cloud/workflows/accFullOutreachPipeline.js (NEW - YOU CREATE)
└── Exports:
    ├── runOutreachPipeline(leads)
    ├── bootstrap(csvUrl, maxLeads, sink)
    ├── mirrorToAirtable(results)
    └── mirrorToClickUp(results)
```

---

## 🔄 WORKFLOW STEPS

### Step 1: Fetch Leads (Google Sheets CSV)
```javascript
const csv = await axios.get(csvUrl);
const leads = parseCSV(csv.data);
// Expected columns: firstName, lastName, company, domain, topic
```

### Step 2: For Each Lead
```
Lead Input (firstName, lastName, domain, company)
  ↓
Hunter.findEmail(domain, firstName, lastName)
  ↓ (if found)
DeepSeek.generateEmail(lead context)
  ↓
Resend.queueEmail(with approval_required: true)
  ↓
(User approves in Telegram)
  ↓
Resend.send()
  ↓
Log to acc_outreach_results table
```

### Step 3: Mirror Results
- If sink="clickup": POST tasks to ClickUp
- If sink="airtable": POST records to Airtable
- Both: Track email sent, approval status, bounce, etc.

---

## 📊 EXPECTED FLOW

**Input:**
```json
{
  "sheetCsvUrl": "https://docs.google.com/...",
  "maxLeads": 10,
  "sink": "clickup"
}
```

**Output:**
```json
{
  "success": true,
  "results": {
    "processed": 10,
    "emailsFound": 8,
    "emailsSent": 7,
    "errors": ["No email for John"]
  },
  "mirrored_to": "clickup"
}
```

---

## ✅ SUCCESS CHECKLIST

- [ ] Create accFullOutreachPipeline.js
- [ ] Export bootstrap() function
- [ ] Fetch CSV from Google Sheets
- [ ] Parse leads correctly
- [ ] Call Hunter.findEmail() for each
- [ ] Call DeepSeek for email generation
- [ ] Call Resend.sendEmail()
- [ ] Handle approvals (approval_required: true)
- [ ] Log to Supabase (acc_outreach_results)
- [ ] Mirror to ClickUp (if requested)
- [ ] Test with 2-3 real leads
- [ ] No errors in pm2 logs

**Time:** 3.5 hours  
**Result:** Full automated outreach pipeline

---

## 🧪 HOW TO TEST

1. **Create test sheet:**
   - Column A: firstName
   - Column B: lastName
   - Column C: company
   - Column D: domain
   - Column E: topic
   
   Example rows:
   ```
   John,Doe,Acme Corp,acmecorp.com,Partnership
   Jane,Smith,TechCo,techco.com,Collaboration
   ```

2. **Get CSV export URL:**
   - Google Sheets: Download as CSV
   - Get public share link with `/export?format=csv`

3. **Call bootstrap endpoint:**
   ```bash
   curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/bootstrap \
     -H "Content-Type: application/json" \
     -d '{
       "sheetCsvUrl": "YOUR_CSV_URL",
       "maxLeads": 2,
       "sink": "clickup"
     }'
   ```

4. **Check results:**
   - Supabase: acc_outreach_results table
   - Telegram: Approval requests appear
   - ClickUp: Tasks created with results

---

## 🆘 DEPENDENCIES

**Must complete before you start:**
- ✅ T3: Connectors fixed (all 10 working)
- ✅ T4: Supabase tables created (acc_outreach_results)

**Connectors you'll use:**
- ✅ Hunter.io - findEmail()
- ✅ DeepSeek - sendTask()
- ✅ Resend - sendEmail()
- ✅ axios - fetch CSV

---

## 🎯 CRITICAL DETAILS

1. **Error Handling:** Use try-catch, log errors, don't crash
2. **Approval Flow:** Set `approval_required: true` so users approve before sending
3. **Supabase:** Create table first (T4 does this)
4. **Parsing:** Handle CSV with headers, extra spaces, etc.
5. **Rate Limits:** Don't blast all leads at once, add delays if needed

---

## 🚀 WHEN COMPLETE

1. Notify Shayan: "T5 Complete - Outreach pipeline working"
2. All other tasks should be done
3. Claude will run integration tests
4. Ready for REDACTED

**Estimated completion:** +3.5 hours from T3 completion

---

## 📚 REFERENCE

See main guide for:
- Full accFullOutreachPipeline.js code
- API endpoint registration
- Testing checklist
- Monitoring setup
