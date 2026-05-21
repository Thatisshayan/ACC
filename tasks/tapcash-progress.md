## TapCash Progress Status & Next Steps

### Current Status (as of now)

| Area | Status | Details |
|------|--------|---------|
| **Authentication** | ✅ Complete | Firebase Auth (login/signup) working |
| **Wallet System** | ✅ Complete | Atomic balance transactions, Firestore consistency |
| **Postback Handler** | ✅ Complete | Lootably signature verification, dedup, 20% referral |
| **Admin Panel** | ✅ Complete | Withdrawals, fraud detection, real data |
| **Withdrawal API** | ✅ Complete | Approve/reject endpoints |
| **Offers API** | ✅ Complete | Real Lootably + mock fallback |
| **Click Tracking** | ✅ Complete | Attribution working |
| **Referrals UI** | ✅ Complete | Page built |
| **Landing Page** | ⚠️ Needs Polish | Functional but not professional enough for Lootably approval |
| **Lootably API Key** | ❌ Not Applied | Need to submit application |
| **Firebase Service Account** | ❌ Needs Rotation | Old key was exposed in git history |
| **Admin User** | ❌ Not Set | Need to set `admin: true` in Firestore |
| **Railway Deployment** | ⚠️ Partially Working | May need env config fix |

### Critical Path (Ordered by Priority)

1. **Security**: Rotate Firebase service account (old key in git)
2. **Admin Setup**: Create admin user in Firestore
3. **Landing Page Polish**: Professional design for Lootably review
4. **Lootably API Key**: Submit application with polished landing page
5. **Deployment**: Ensure Railway works with new credentials

---

## Exact ACC Bot Commands (10 total, priority-ordered)

### Priority 1: Security & Admin (Critical)


1. openhands:/task: Rotate Firebase service account key at C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash_mvp - generate new key, update .env.local, remove old key from git history using git filter-branch, update Railway env vars



2. aider:/task: Set admin user in Firestore - run a script or Firestore console command to set `admin: true` on Shayan's Firebase Auth UID (get UID from Firebase console or auth debug endpoint)


### Priority 2: Landing Page Polish


3. openhands:/task: Polish landing page at C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash_mvp - make it professional for Lootably approval: add hero section with value prop, feature cards, trust badges, clear CTA, responsive design, proper meta tags, and a 'How It Works' section. Use Tailwind CSS, keep it clean and modern.


### Priority 3: Lootably Integration


4. aider:/task: Create a Lootably API key application document - write a professional one-page PDF/HTML explaining TapCash platform, user base, fraud prevention measures, and why we need the API key. Include screenshots of admin panel and landing page.


### Priority 4: Deployment & Testing


5. openhands:/task: Fix Railway deployment at tapcash-REDACTED.up.railway.app - check logs, ensure new Firebase service account env vars are set, test /api/health endpoint, verify auth flow works in REDACTED


### Priority 5: Feature Completion


6. aider:/task: Add loading states and error boundaries to all pages in C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash_mvp - ensure wallet, offers, referrals, and admin pages have proper loading skeletons and error fallbacks



7. openhands:/task: Add rate limiting to /api/postback and /api/withdraw endpoints in C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash_mvp - use a simple in-memory rate limiter (or Firestore-based for REDACTED) to prevent abuse


### Priority 6: Monitoring & Analytics


8. aider:/task: Add basic analytics tracking to TapCash - implement page view tracking (can use a simple Firestore counter or Google Analytics 4 snippet) for landing page, signup funnel, and offer clicks


### Priority 7: Documentation & Handoff


9. openhands:/task: Generate a README.md for C:\Users\Shaya\OneDrive\Desktop\STARTUP\TAP CASH\tapcash_mvp - include setup instructions, env vars needed, architecture overview, API endpoints list, and deployment guide


### Priority 8: Final Verification


10. aider:/task: Run full integration test on TapCash - verify: auth flow, wallet balance updates, postback handler with mock signature, withdrawal approval flow, admin panel loads, offers API returns data, referral tracking works. Report any failures.


---

### Execution Order

1. Run commands 1-2 immediately (security first)
2. Run command 3 (landing page polish)
3. Run command 4 (Lootably application)
4. Run command 5 (deployment fix)
5. Run commands 6-8 (polish)
6. Run commands 9-10 (docs + final test)

### Risk Notes

- **Firebase key rotation**: Must update Railway env vars immediately after generating new key
- **Lootably approval**: May take 1-3 business days after submission
- **Admin user**: If UID is unknown, use Firebase Auth REST API to look up by email
- **Rate limiting**: In-memory limiter will reset on Railway restart; consider Firestore-based for REDACTED