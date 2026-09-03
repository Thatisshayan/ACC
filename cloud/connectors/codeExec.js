'use strict';
// cloud/connectors/codeExec.js — Sandboxed code execution + outbound HTTP for agents
//
// SECURITY NOTES:
// - node:vm is NOT a real security boundary (Node's own docs say so). runJS/transform
//   below still use it, so this whole module is disabled by default (CODEEXEC_ENABLED)
//   and, at the call site (cloud/messages/service.js), gated to admin-role callers only.
//   Treat "enabled" as "trusted admin code execution", not "safe for arbitrary input."
// - httpRequest() blocks requests to private/loopback/link-local addresses (including
//   cloud metadata endpoints) by validating the *actually-connected* IP via a custom
//   DNS lookup on the request agent, which also closes the DNS-rebinding gap.

const vm      = require('vm');
const fetch   = require('node-fetch');
const { log } = require('../utils/logger.js');
const ssrfGuard = require('../utils/ssrfGuard.js');
const { isPrivateOrReservedIP, agentFor, assertPublicHttpUrl } = ssrfGuard;

const CODE_TIMEOUT_MS = 5000;

const ENABLED = String(process.env.CODEEXEC_ENABLED || '').trim().toLowerCase() === 'true';

// Optional: comma-separated hostname allowlist for outbound HTTP (e.g. "api.example.com,hooks.example.com").
// Empty = no domain allowlist (private/reserved-IP block still applies).
const HTTP_ALLOWLIST = String(process.env.CODEEXEC_HTTP_ALLOWLIST || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const DISABLED_RESULT = {
  success: false,
  error: 'codeExec: disabled. Set CODEEXEC_ENABLED=true (admin-only, high-risk primitive) to enable.',
};

/**
 * runJS — execute a JS snippet in a sandboxed VM
 * @param {string} code  - JS code to run (must set `result` variable)
 * @param {object} context - variables to inject into sandbox
 * Returns: { success, output, error? }
 */
function runJS(code, context = {}) {
  if (!ENABLED) return DISABLED_RESULT;
  const sandbox = {
    result:  undefined,
    console: { log: (...a) => log('[codeExec]', ...a), warn: (...a) => log('[codeExec warn]', ...a) },
    JSON, Math, Date, parseInt, parseFloat, isNaN, Array, Object, String, Number, Boolean,
    ...context,
  };
  try {
    const script = new vm.Script(code);
    const ctx    = vm.createContext(sandbox);
    script.runInContext(ctx, { timeout: CODE_TIMEOUT_MS });
    return { success: true, output: sandbox.result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── SSRF guard ──────────────────────────────────────────────────────────────
// Shared with cloud/hub/commands.js (webhookUrl SSRF) — see cloud/utils/ssrfGuard.js.
// Decimal/octal/hex-encoded IP hosts (e.g. "2130706433" or "0x7f000001" for
// 127.0.0.1) are a well-known SSRF filter-bypass technique elsewhere, but not
// here: the WHATWG URL parser normalizes all of these to dotted-quad form before
// the hostname is ever read (verified — `new URL('http://2130706433/').hostname`
// is already "127.0.0.1"), so they're caught by the private-IP check like any
// other literal IP. See cloud/connectors/codeExec.test.js.

function assertAllowedUrl(rawUrl) {
  return assertPublicHttpUrl(rawUrl, { allowlist: HTTP_ALLOWLIST, label: 'codeExec' });
}

/**
 * httpRequest — make an HTTP request on behalf of an agent
 * @param {string} method
 * @param {string} url
 * @param {object} headers
 * @param {object|string} body
 */
async function httpRequest(method, url, headers = {}, body) {
  if (!ENABLED) return DISABLED_RESULT;

  let parsed;
  try {
    parsed = assertAllowedUrl(url);
  } catch (e) {
    return { success: false, error: e.message };
  }

  const options = {
    method: (method || 'GET').toUpperCase(),
    headers: { 'Content-Type': 'application/json', ...headers },
    agent: agentFor(parsed),
    redirect: 'manual', // don't silently follow a redirect into a private address
  };
  if (body && options.method !== 'GET') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  try {
    // `parsed` is the caller-supplied URL, but it has already passed assertAllowedUrl()
    // (protocol + literal-IP + obfuscated-IP checks above) and `options.agent` pins the
    // DNS resolution used for the actual TCP connection to safeLookup(), which re-checks
    // every resolved address before connecting. See cloud/connectors/codeExec.test.js for
    // the SSRF regression coverage (metadata IP, loopback IP, DNS-rebinding-style hostname).
    const res = await fetch(parsed.toString(), options); // codeql[js/request-forgery] -- see comment above; SSRF guard covered by tests, not a taint sanitizer CodeQL recognizes
    if (res.status >= 300 && res.status < 400) {
      return { success: false, error: 'codeExec: redirect responses are not followed (SSRF guard).', status: res.status };
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { success: res.ok, status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * parseAndTransform — apply a transformation expression to data
 * e.g. extract fields, filter arrays, reshape objects
 */
function parseAndTransform(data, expression) {
  if (!ENABLED) return DISABLED_RESULT;
  return runJS(`result = (function(data) { return ${expression}; })(data)`, { data });
}

/**
 * runCodeExecTask — unified entry point used by executor.js
 */
async function runCodeExecTask(payload) {
  try {
    const action = payload?.action || 'runJS';

    if (action === 'runJS') {
      if (!payload.code) return { success: false, error: 'codeExec: code is required for runJS.' };
      return runJS(payload.code, payload.context || {});
    }

    if (action === 'http') {
      if (!payload.url) return { success: false, error: 'codeExec: url is required for http.' };
      return await httpRequest(payload.method, payload.url, payload.headers, payload.body);
    }

    if (action === 'transform') {
      if (!payload.data || !payload.expression) return { success: false, error: 'codeExec: data and expression are required for transform.' };
      return parseAndTransform(payload.data, payload.expression);
    }

    return { success: false, error: `codeExec: unknown action "${action}". Valid: runJS, http, transform` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { runJS, httpRequest, parseAndTransform, runCodeExecTask, isPrivateOrReservedIP };
