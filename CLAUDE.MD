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

- [ ] **HIT /api/debug** — find which module is failing on Railway
- [ ] **Fix the missing dependency** causing safeRequire to fail silently
- [ ] **Supabase service role key** — retrieve and add to Railway
- [ ] **Run SQL tables** on new Supabase project (ACTIVATION.md Step 1)
- [ ] **Stripe products** — create 3 price IDs in Stripe dashboard
- [ ] **Privacy.com** — add PRIVACY_API_KEY to Railway
- [ ] **Code signing** — Windows SmartScreen warning on desktop exe (needs cert)
- [ ] **GitHub Release** — needed for auto-updater to work
- [ ] **Apple Developer account** — ready, use for EAS iOS build
- [ ] **Stripe live mode** — swap test keys when ready to charge

---

## Last Commits (in order)
- `b27b48be` — T1–T10 all features
- `81af658e` — Desktop → thin shell pointing to acccommand.center
- `c0626e65` — Desktop cleanup, real icon, ACC branding
- `42489dca` — CORS: added ju2687yg.up.railway.app
- `78849ef7` — Email addresses updated everywhere
- `466177a9` — Switched to nixpacks, deleted Dockerfile
- `303c139f` — Added /api/debug endpoint (CURRENT — not yet confirmed live)

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