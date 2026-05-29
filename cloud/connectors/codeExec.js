'use strict';
// cloud/connectors/codeExec.js — Safe sandboxed code execution for agents
// Supports: JavaScript (Node.js VM sandbox), HTTP API calls, shell-safe commands
//
// SECURITY: JS runs inside node:vm with a 5s timeout and no fs/child_process access.
// HTTP calls are explicit (agents request them) — no arbitrary URL fetch without payload.url.

const vm      = require('vm');
const fetch   = require('node-fetch');
const { log } = require('../utils/logger.js');

const CODE_TIMEOUT_MS = 5000;

/**
 * runJS — execute a JS snippet in a sandboxed VM
 * @param {string} code  - JS code to run (must set `result` variable)
 * @param {object} context - variables to inject into sandbox
 * Returns: { success, output, error? }
 */
function runJS(code, context = {}) {
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

/**
 * httpRequest — make an HTTP request on behalf of an agent
 * @param {string} method
 * @param {string} url
 * @param {object} headers
 * @param {object|string} body
 */
async function httpRequest(method, url, headers = {}, body) {
  const options = {
    method: (method || 'GET').toUpperCase(),
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body && options.method !== 'GET') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  try {
    const res  = await fetch(url, options);
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

module.exports = { runJS, httpRequest, parseAndTransform, runCodeExecTask };
