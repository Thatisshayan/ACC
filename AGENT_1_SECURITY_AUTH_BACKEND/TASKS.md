# Agent 1 — Security / Auth / Backend Lockdown — Assigned Tasks

Below are the rows assigned from the ACC master task list.

| Priority | Phase | Task | Subtask | Status |
|---|---|---|---|---|
| P0 | 0 Emergency Lockdown | Remove exposed production hazards | Delete/protect /api/admin/setup | Complete |
| P0 | 0 Emergency Lockdown | Remove exposed production hazards | Disable/protect /api/debug | Complete |
| P0 | 0 Emergency Lockdown | Remove exposed production hazards | Remove one-time/probe/debug scripts from prod | Complete |
| P0 | 0 Emergency Lockdown | Remove exposed production hazards | Add security headers | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /admin/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/admin/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/card/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/execute | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /orchestrate | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/taskbus/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/outreach/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/synapse/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/memory/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/ui mutation routes | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/messages/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/assistant paid/mutation routes | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/autonomy/* | Complete |
| P0 | 0 Emergency Lockdown | Lock sensitive routes | /api/hub/* | Complete |
| P0 | 0 Emergency Lockdown | Fix approval spoofing | Require authenticated user | Complete |
| P0 | 0 Emergency Lockdown | Fix approval spoofing | Require operator/admin role | Complete |
| P0 | 0 Emergency Lockdown | Fix approval spoofing | Add TTL/replay protection/CSRF | Complete |
| P0 | 1 App Loading and Core Verify | Build and ship React dashboard | Verify nested routes | Complete |
| P1 | 1 App Loading and Core Verify | Fix voice transcription endpoint mismatch | Choose canonical route | Complete |
| P0 | 1 App Loading and Core Verify | Fix safeRequire visibility | Admin-only diagnostics | Complete |
| P0 | 1 App Loading and Core Verify | Fix safeRequire visibility | Verify billing/card/phone/memory routes | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | users | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | roles | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | sessions | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | tasks | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | task_results | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | approvals | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | audit_events | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | connected_accounts | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | memory | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | subscriptions | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | waitlist | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | outreach_results | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | rate_limits | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | feature_usage | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | media_assets | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | job_applications | Complete |
| P1 | 2 Database Auth Migrations | Create core database schema | suppression_list | Complete |
| P1 | 2 Database Auth Migrations | Enable Supabase RLS | Enable RLS | Complete |
| P1 | 2 Database Auth Migrations | Enable Supabase RLS | Service-role backend writes | Complete |
| P1 | 2 Database Auth Migrations | Public config endpoint | GET /api/config/public | Complete |
| P1 | 2 Database Auth Migrations | Public config endpoint | Move anon key from login HTML | Complete |
| P2 | 2 Database Auth Migrations | Data lifecycle | Retention jobs | Complete |
| P2 | 2 Database Auth Migrations | Data lifecycle | Delete expired snapshots | Complete |
| P2 | 2 Database Auth Migrations | Data lifecycle | Delete stale waitlist data | Complete |
| P2 | 2 Database Auth Migrations | Data lifecycle | Data export endpoint | Complete |
| P2 | 2 Database Auth Migrations | Data lifecycle | Account deletion endpoint | Complete |
| P2 | 2 Database Auth Migrations | Data lifecycle | Retention docs | Complete |
| P2 | 8 Media | Whisper transcription | Verify transcription route | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Dashboard task status | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Connector health | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Queue stats | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Assistant flow | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Secure approvals | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Messenger | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Protected admin | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Audit filters | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Secrets safe UI | Complete |
| P2 | 9 Dashboard Admin UX | Dashboard core pages | Settings | Complete |
| P2 | 9 Dashboard Admin UX | WebSocket client | Frontend WS hook | Complete |
| P2 | 9 Dashboard Admin UX | WebSocket client | Task update subscription | Complete |
| P2 | 9 Dashboard Admin UX | WebSocket client | No-refresh updates | Complete |
| P2 | 9 Dashboard Admin UX | WebSocket client | Reconnect/backoff | Complete |
| P2 | 9 Dashboard Admin UX | WebSocket client | Polling fallback | Complete |
| P2 | 9 Dashboard Admin UX | WebSocket client | Connection indicator | Complete |
| P2 | 9 Dashboard Admin UX | Admin auth UI | Admin login | Complete |
| P2 | 9 Dashboard Admin UX | Admin auth UI | Admin token/role | Complete |
| P2 | 9 Dashboard Admin UX | Admin auth UI | Safe storage/session | Complete |
| P2 | 9 Dashboard Admin UX | Admin auth UI | Bearer header | Complete |
| P2 | 9 Dashboard Admin UX | Admin auth UI | Redirect on 401 | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Profile setup | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Connect Telegram | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Autonomy goal | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Upload resume | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Connect Gmail | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Connector wizard | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Test command wizard | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Billing selection | Complete |
| P3 | 9 Dashboard Admin UX | Onboarding | Progress store | Complete |
| P3 | 10 Mobile Desktop Comms | Desktop app | Auth/session behavior | Complete |
| P3 | 10 Mobile Desktop Comms | Email monitoring | Gmail/OAuth or IMAP | Complete |
| P2 | 11 Reliability Observability | Monitoring and logging | Suppress debug | Complete |
| P2 | 12 Cleanup Docs | Remove dead artifacts | Archive router | Complete |
| P2 | 12 Cleanup Docs | Remove dead artifacts | Clean debug scripts | Complete |
| P0 | 13 Compliance Launch | Launch criteria | No public debug/setup | Complete |
