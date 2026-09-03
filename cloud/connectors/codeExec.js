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
const dns     = require('dns');
const net     = require('net');
const http    = require('http');
const https   = require('https');
const fetch   = require('node-fetch');
const { log } = require('../utils/logger.js');

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

function isPrivateOrReservedIP(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;                      // 10.0.0.0/8
    if (a === 127) return true;                      // loopback
    if (a === 169 && b === 254) return true;          // link-local incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 0) return true;                          // "this network"
    if (a >= 224) return true;                          // multicast/reserved/broadcast
    return false;
  }
  if (net.isIP(ip) === 6) {
    const low = ip.toLowerCase();
    if (low === '::1') return true;                    // loopback
    if (low.startsWith('fe80:')) return true;           // link-local
    if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique local
    if (low.startsWith('::ffff:')) {                    // IPv4-mapped
      const v4 = low.split(':').pop();
      if (net.isIP(v4) === 4) return isPrivateOrReservedIP(v4);
    }
    return false;
  }
  return true; // unresolvable / unknown family — block, don't guess
}

// Custom dns lookup used by the request agents below: this is the address Node
// actually connects to, so validating here (not in a separate pre-check) closes
// DNS-rebinding — a hostname can't resolve to something safe at check-time and
// something private at connect-time.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const entries = Array.isArray(address) ? address : [{ address, family }];
    for (const entry of entries) {
      const ip = entry.address || entry;
      if (isPrivateOrReservedIP(ip)) {
        return callback(new Error(`codeExec: blocked outbound request to private/internal address (${ip})`));
      }
    }
    callback(null, address, family);
  });
}

const safeHttpAgent  = new http.Agent({ lookup: safeLookup });
const safeHttpsAgent = new https.Agent({ lookup: safeLookup });

function assertAllowedUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('codeExec: invalid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`codeExec: protocol "${parsed.protocol}" not allowed (http/https only).`);
  }
  // A literal IP in the URL (http://169.254.169.254/...) never goes through DNS,
  // so it never hits safeLookup below — Node connects directly to it. Check it here.
  const bareHost = parsed.hostname.replace(/^\[|\]$/g, ''); // strip [..] from IPv6 literals
  if (net.isIP(bareHost) && isPrivateOrReservedIP(bareHost)) {
    throw new Error(`codeExec: blocked outbound request to private/internal address (${bareHost})`);
  }
  if (HTTP_ALLOWLIST.length && !HTTP_ALLOWLIST.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`codeExec: host "${parsed.hostname}" is not on the allowlist.`);
  }
  return parsed;
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
    agent: parsed.protocol === 'https:' ? safeHttpsAgent : safeHttpAgent,
    redirect: 'manual', // don't silently follow a redirect into a private address
  };
  if (body && options.method !== 'GET') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  try {
    const res = await fetch(parsed.toString(), options);
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
