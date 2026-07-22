---

## Email Addresses (do not expose personal ones publicly)

| Address | Use | In code |
|---------|-----|---------|
| auth@acccommand.center | Magic links / OTP | Resend FROM, Supabase SMTP |
| hello@acccommand.center | Public contact | Landing page footer |
| support@acccommand.center | Support | Login page, user manual |
| billing@acccommand.center | Stripe receipts | Set in Stripe dashboard |
| developer@acccommand.center | App Store / desktop binary | desktop/package.json |
| shayan@acccommand.center | Personal — keep private | Not in code |

---

## Build Commands

```bash
# Deploy (auto on git push to master)
git push origin master

# Android APK
cd mobile && eas build --platform android --profile android-apk

# iOS build
cd mobile && eas build --platform ios --profile ios-preview

# Desktop portable exe
cd desktop && npm run build
# Output: desktop/dist/ACC 2.0.0.exe (66MB portable)

# Local dev
node scripts/start.js
```

---

## What's Pending / Not Done Yet

- [x] **Missing dependency found & fixed (2026-07-22)** — `twilio` was `require()`'d in `cloud/api/phoneRoutes.js` but never listed in `package.json`. That's why `safeRequire` was silently disabling the phone module. Ran `npm install twilio --save`; `phoneRoutes.js` now loads clean. Verify on next Railway deploy.
- [ ] **`/api/debug` is a dead end in production** — the route itself does `if (NODE_ENV === "production") return 404`, so hitting it on the live Railway deploy will never reveal anything. If we want prod-safe module diagnostics, either add a `moduleLoadStatus` field to a route that isn't prod-gated (e.g. `/api/health`), or check Railway's runtime logs directly (`railway logs`, requires a working CLI login — see below).
- [ ] **Railway CLI is installed but not usable from this machine** — `railway whoami` succeeds (shayanezraeil@gmail.com) but `railway list`/`link` return `Unauthorized`; the session token appears stale. Needs `railway login` run interactively by you (browser OAuth), after which env-var sync and log tailing become possible from here.
- [x] **Supabase service role key** — already present in local `.env`. Not yet confirmed synced to Railway (can't verify without working Railway CLI access — see above).
- [ ] **Run SQL tables** on new Supabase project (ACTIVATION.md Step 1) — not run from this session (needs Supabase project credentials/MCP auth, not available here).
- [x] **Stripe price IDs** — `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_BUILDER`, `STRIPE_PRICE_OPERATOR` are already populated in local `.env`. Unclear if these are live in the Stripe dashboard or leftover from a prior session — verify in Stripe dashboard directly.
- [x] **Privacy.com** — `PRIVACY_API_KEY` already present in local `.env`; same caveat as above, not confirmed synced to Railway.
- [ ] **Code signing** — Windows SmartScreen warning on desktop exe (needs a purchased cert — can't be done from this session).
- [ ] **GitHub Release** — needed for auto-updater to work (safe to do once code-signing is sorted, or immediately for a signed-later minor bump).
- [ ] **Apple Developer account** — ready, use for EAS iOS build (needs your interactive Apple/EAS login).
- [ ] **Stripe live mode** — swap test keys when ready to charge (do only after dashboard price IDs above are confirmed correct).

### Security finding (2026-07-22)
`.env` was committed to git history early on (`git log --all --full-history -- .env` → added in the initial commit, later deleted in commit `3c7e84e` on branch `Thatisshayan-patch-1`, not on `master`). That branch **is pushed to GitHub** (`origin/Thatisshayan-patch-1`). The repo is private (confirmed via GitHub API 404 for unauthenticated access), so exposure is limited to people/tokens with repo access — but the secrets are still sitting in that branch's history and retrievable by anyone with read access via `git show <sha>:.env`. **Recommend rotating every key that was in that historical `.env`** (Supabase service role key, Stripe secret key, any API keys) and, once rotated, deleting or force-rewriting the stale branches that still hold it. I did not rewrite history or delete branches — that's destructive and should be your call.

---

## Last Commits (in order)
- `f5b1a54` — docs: Defer Supabase SQL setup and additional configuration items (pushed 2026-07-22)
- `5107832` — docs: Add Supabase SQL setup guide for database tables
- `a474f51` — docs: add AGENTS.md with agent rules for ACC orchestration system
- `4ac5764` — Update README.md
- `b27b48be` — T1–T10 all features
- `81af658e` — Desktop → thin shell pointing to acccommand.center
- `c0626e65` — Desktop cleanup, real icon, ACC branding
- `42489dca` — CORS: added ju2687yg.up.railway.app
- `78849ef7` — Email addresses updated everywhere
- `466177a9` — Switched to nixpacks, deleted Dockerfile
- `303c139f` — Added /api/debug endpoint (dead-ends in production, see above)

---

## What Works Right Now
- acccommand.center domain ✅
- Landing page at / ✅
- Login page at /login ✅
- Auth guard at /app ✅
- Android APK built (EAS link in session) ✅
- Desktop portable exe: desktop/dist/ACC 2.0.0.exe ✅
- Railway nixpacks build (faster deploys) ✅
- GitHub auto-deploy connected ✅
- Supabase magic link auth (new project) ✅