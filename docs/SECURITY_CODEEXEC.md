# codeExec security notes

`cloud/connectors/codeExec.js` provides two dangerous primitives to the rest of the
system: `runJS`/`transform` (arbitrary JavaScript via `node:vm`) and `httpRequest`
(server-side outbound HTTP to a caller-supplied URL). This document is the record of
why they're gated the way they are — read it before loosening any of it.

## What changed (2026-09-03)

An audit found both primitives reachable straight from ordinary chat text via the
assistant's `code.run` and `agent.http` intents (`cloud/messages/service.js`,
routed through `POST /api/assistant/execute`), with no privilege check beyond the
route's normal operator-or-admin auth:

- **`code.run`** wrapped the caller's raw chat message in a JS function body and ran
  it through `node:vm`. `vm` is explicitly documented by Node as *not* a security
  boundary — objects passed into the sandbox context (`JSON`, `Math`, `Object`, …)
  originate in the outer realm, and their prototype chain leads back to the real,
  unsandboxed `Function` constructor. That's a known, working sandbox escape to full
  host code execution.
- **`agent.http`** fetched any URL the caller supplied server-side with no
  restriction — including internal/private addresses and cloud metadata endpoints
  (`169.254.169.254`).

Both were reachable by any **operator**-role API key, not just admin.

## What's in place now

1. **Kill switch.** `CODEEXEC_ENABLED` (env var, default `false`) gates `runJS`,
   `transform`, and `httpRequest` at the connector level. Nothing in
   `cloud/connectors/codeExec.js` runs unless this is explicitly `true`.
2. **Admin-only at the chat entry point.** `code.run` and `agent.http` (in
   `cloud/messages/service.js`) now require `payload.role === 'admin'` — operator
   keys are rejected before anything executes. The route (`cloud/api/assistant.js`)
   passes the authenticated role through from `req.auth.role`; any caller that
   doesn't supply a role fails closed.
3. **`code.run` no longer touches `vm` at all.** The only real use case reaching
   this intent is arithmetic ("calculate 12 \* (3 + 4)"). It's now evaluated by
   `cloud/utils/safeExpr.js`, a small hand-written parser that understands numbers,
   `+ - * / % ^`, parentheses, and a whitelist of `Math` functions — nothing else.
   There's no `eval`, no `Function`, no `vm`, so there's no code-execution surface
   to escape from. Anything that isn't a plain expression is rejected with an error,
   not executed.
4. **SSRF guard on `httpRequest`.** Requests are only allowed on `http`/`https`,
   redirects are not followed automatically, and — critically — the outbound
   connection's DNS lookup is intercepted (`safeLookup` in `codeExec.js`) so the
   *actual IP being connected to* is checked against private/loopback/link-local/
   reserved ranges, not just the hostname before a second, separate resolution.
   That closes DNS rebinding (resolve-safe-then-connect-elsewhere), not just a
   naive up-front hostname check. An optional `CODEEXEC_HTTP_ALLOWLIST` env var
   restricts outbound requests to a fixed set of hostnames.
5. **Audit logging.** Every `code.run` / `agent.http` attempt — allowed, rejected,
   or failed — is recorded via `cloud/utils/auditLog.js#logNodeRun`, same as
   graph-node "code" agent executions already were.

## What's still true even with `CODEEXEC_ENABLED=true`

`runJS` and `transform` still run through `node:vm`, which is still not a real
sandbox. Enabling the flag should be read as "I trust whoever can reach this as an
admin to run arbitrary code," not "this is now safe against untrusted input." If a
real use case needs to run untrusted/semi-trusted JS, that calls for a real
isolate (e.g. `isolated-vm`) instead of turning this flag on.

## Also fixed since the original writeup

- **Intent matching is anchored, not free-floating.** `code.run`/`agent.http`
  previously matched their trigger phrases anywhere in a message (`\b(...)\b`), so
  ordinary sentences like "can you run this by me" could mis-fire into a
  code-execution intent. Both are now anchored to the start of the message
  (`^\s*(...)`), so this only fires on an explicit command.
- **Literal-IP SSRF bypass closed.** The DNS-lookup-based SSRF guard only protects
  hostnames that actually go through DNS — Node skips DNS entirely when a URL's
  host is already a literal IP (`http://169.254.169.254/...`), which would have
  sailed past the original guard. `assertAllowedUrl()` now checks literal-IP hosts
  directly, before any request is attempted.

## Regression coverage

Automated now — `cloud/utils/safeExpr.test.js`, `cloud/connectors/codeExec.test.js`,
and `cloud/messages/service.test.js` (run via `npm test`). They cover:
- The documented `vm` escape payload (`this.constructor.constructor('return
  process')()`) is rejected as a parse error by `safeExpr`, never reaches `vm`.
- `codeExec.httpRequest` blocks a literal metadata IP, a literal loopback IP, and a
  hostname (`localhost`) that resolves to loopback at connect time.
- Non-http(s) schemes and invalid URLs are rejected.
- An optional host allowlist (`CODEEXEC_HTTP_ALLOWLIST`), when set, is enforced.
- `CODEEXEC_ENABLED` unset/false disables `runJS`/`http`/`transform`; `true`
  re-enables them.
- `code.run`/`agent.http` reject operator-role and role-less callers, and accept
  admin-role callers.
- `code.run`/`agent.http` only parse as intents when their trigger phrase starts
  the message, not when it appears anywhere inside one.

Before trusting this again after any future change to `codeExec.js`,
`cloud/utils/safeExpr.js`, or the `code.run`/`agent.http` handlers in
`cloud/messages/service.js`, run `npm test` and make sure all of the above still
pass — don't just eyeball the diff.
