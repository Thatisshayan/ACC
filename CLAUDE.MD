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

### Line-by-line debug pass (2026-07-22, continued)
- **Found & fixed: `openai` missing dependency.** `cloud/api/assistant.js` `require('openai')` for the `/api/assistant/transcribe` voice endpoint, but `openai` was never in `package.json` — every transcription call was silently 500ing with "Cannot find module 'openai'". Added `"openai": "^6.48.0"` to `package.json`/`package-lock.json`. Install hit transient `EPERM`/`ENOTEMPTY` errors on this Windows machine (leftover locked files from a prior interrupted install), but after retrying, `require('openai')` now resolves cleanly and was verified locally.
- **Found & fixed: Stripe webhook was silently broken end-to-end.** Two compounding bugs in `cloud/server.js`: (1) the global `app.use(express.json())` ran *before* `/api/billing` was mounted, consuming the request body — so `billingRoutes.js`'s own `express.raw()` on `/webhook` got an already-parsed body, meaning `stripe.webhooks.constructEvent()` would always fail signature verification once `STRIPE_WEBHOOK_SECRET` was set. (2) The entire `/api/billing` router (webhook included) was gated behind `requireOperatorOrAdmin` — but Stripe never sends a Bearer token, so real webhook calls would 401 before reaching the handler at all. Fixed both: JSON parsing now skips `/api/billing/webhook` specifically, and that one path is excluded from the operator/admin auth gate (signature verification inside the route is the real auth for that path).
- **Found & fixed: unauthenticated sensitive routes.** `/api/email`, `/api/fsc`, and `/api/loops` were mounted with no auth middleware at all — internally, `emailRoutes.js` had zero auth on its own routes, meaning anyone on the internet could `POST /api/email/credentials` to plant IMAP credentials, `GET` any user's stored credentials by guessing `userId` (IDOR), `DELETE` any credential, or trigger `/api/email/poll`. `fscRoutes.js` similarly allowed unauthenticated `POST /api/fsc/publish` (posts to Instagram/Facebook) and paid generation endpoints (image/video/narration). Added `requireOperatorOrAdmin` to all three mounts in `server.js`.
- **`@sentry/node` also missing** but already soft-guarded with try/catch in `scripts/start.js` (logs a warning and continues) — not urgent, install only if you want Sentry error tracking active.
- **Found a working prod-safe module-status endpoint that already exists**: `GET /admin/modules` (`cloud/admin/api.js`) returns `moduleLoadStatus` with no production gate, unlike `/api/debug` which 404s in prod. Use this instead of `/api/debug` to check which modules failed to load on the live Railway deploy (still needs admin auth).
- Checked `cloud/api/*`, `cloud/admin/*`, `cloud/orchestrator/*`, `cloud/security/*`, `cloud/taskbus/*`, `cloud/services/privacyCard.js`, `cloud/telegram/botLock.js` line-by-line: no other missing dependencies, no broken auth/HMAC logic, no silently-swallowed errors beyond intentional best-effort fire-and-forget syncs (Airtable/ClickUp). `STRIPE_API_KEY` vs `STRIPE_SECRET_KEY` naming looked like a bug at first glance but both are actually set in `.env` — false alarm, documented so it isn't re-investigated.
- **Found & fixed: `startWSServer` returned a different shape on repeat calls** (`cloud/ws/server.js`) — the already-started guard returned the bare `wss` instance instead of `{ wss, broadcast }`, so a second caller destructuring `.broadcast` would silently get `undefined` and crash on first use.
- **Found & fixed: path traversal in DLQ admin routes** (`cloud/dlq/handler.js`) — `getDLQItem`/`markRequeued`/`deleteDLQItem` built a filesystem path directly from `req.params.id` (`cloud/admin/dlqRoutes.js`) with zero validation. Admin-gated so needs a valid admin key to exploit, but still real — added a regex check against the actual DLQ id shape (`dlq_<timestamp>_<sanitized>`) before touching the filesystem.
- **Found & fixed: timing-unsafe token comparisons** in two places — `cloud/middleware/auth.js` (API key auth for every `requireOperatorOrAdmin` route) and `cloud/services/alphonsoBridgeService.js` (Alphonso bridge token) both used plain `===`/`!==` instead of `crypto.timingSafeEqual`, inconsistent with the rest of the security code (`webhookHmac.js` does this correctly). Both fixed with a shared `timingSafeStringEqual` helper.
- **Found: `cloud/roles/approvalQueue.js`, `cloud/roles/negotiationPolicy.js`, `cloud/roles/roleDefinitions.js` are 100% dead code** — nothing anywhere in the repo requires anything from `cloud/roles/`. The live equivalents are `cloud/utils/approvalQueue.js` and `cloud/utils/negotiationPolicy.js`, which is what `cloud/executor.js` and `cloud/admin/api.js` actually import. Not deleted (left for you to confirm before removing), but don't edit `cloud/roles/*` expecting it to do anything.
- **Found: approval notifications are a stub for generic task nodes.** `cloud/utils/approvalQueue.js`'s `notifyOperator()` only does `console.log` — there's a `// TODO: send Telegram message` that was never wired up. Contrast with `cloud/api/cardRoutes.js`, which *does* send a real Telegram approval message via `sendCardApprovalRequest`. Net effect: card-purchase approvals notify you on Telegram; generic graph-node approvals (`requiresApproval: true`) do not — you'd only see them by polling `/admin/approvals`. Worth wiring up if you rely on approval gates outside the card flow.
- **Ran `npm audit fix` (non-breaking)**: went from 15 to 9 vulnerabilities (fixed axios, body-parser, fast-xml-builder, imapflow, nodemailer, ws). The remaining 9 all collapse to two breaking major-version bumps: `node-telegram-bot-api` 0.6x→1.2.0 and `uuid`→14.x. Deferred — `node-telegram-bot-api` in particular is core to the whole Telegram bot and the fork doing the connectors/telegram pass this session may have opinions on API compatibility; do this as its own tested change, not blind `--force`.
- *(Parallel fork pass, connectors/integrations/telegram)*: **Found & fixed real crash bug** in `cloud/taskbus/providerFallback.js` — `tryAlibaba()` returned `null` on the disabled/failed/error paths instead of the `{tried, success, reason}` shape every other provider function returns; `executeWithProviderFallback()` does `if (result.tried)` unconditionally, so any task falling through to Alibaba threw `Cannot read properties of null (reading 'tried')` and killed the whole task — this is the documented root cause of live "Loop X failed: Cannot read properties of null" errors seen in autonomy loops.

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