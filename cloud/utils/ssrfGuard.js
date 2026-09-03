'use strict';
// cloud/utils/ssrfGuard.js — shared SSRF guard for any outbound HTTP call that
// targets a caller-supplied URL (as opposed to a hardcoded host with a caller-
// supplied path segment, which isn't SSRF — the host can't be redirected by that).
//
// Extracted from cloud/connectors/codeExec.js's httpRequest() guard, which is
// exercised by cloud/connectors/codeExec.test.js — see that file for the actual
// regression coverage (metadata IP, loopback, DNS-rebinding-style hostname,
// obfuscated IP encodings, non-http(s) schemes).

const dns   = require('dns');
const net   = require('net');
const http  = require('http');
const https = require('https');

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
        return callback(new Error(`ssrfGuard: blocked outbound request to private/internal address (${ip})`));
      }
    }
    callback(null, address, family);
  });
}

const safeHttpAgent  = new http.Agent({ lookup: safeLookup });
const safeHttpsAgent = new https.Agent({ lookup: safeLookup });

/**
 * assertPublicHttpUrl — throws unless rawUrl is a plain http/https URL whose
 * host isn't a literal private/reserved IP. Does NOT protect against DNS
 * rebinding by itself — pair with agentFor() below so the actual connection
 * also goes through safeLookup.
 * @param {string} rawUrl
 * @param {{ allowlist?: string[], label?: string }} [opts]
 */
function assertPublicHttpUrl(rawUrl, opts = {}) {
  const label = opts.label || 'ssrfGuard';
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label}: invalid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label}: protocol "${parsed.protocol}" not allowed (http/https only).`);
  }
  const bareHost = parsed.hostname.replace(/^\[|\]$/g, ''); // strip [..] from IPv6 literals
  if (net.isIP(bareHost) && isPrivateOrReservedIP(bareHost)) {
    throw new Error(`${label}: blocked outbound request to private/internal address (${bareHost})`);
  }
  if (opts.allowlist && opts.allowlist.length && !opts.allowlist.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`${label}: host "${parsed.hostname}" is not on the allowlist.`);
  }
  return parsed;
}

/** agentFor — the SSRF-guarded http/https Agent matching a parsed URL's protocol. */
function agentFor(parsedUrl) {
  return parsedUrl.protocol === 'https:' ? safeHttpsAgent : safeHttpAgent;
}

module.exports = {
  isPrivateOrReservedIP,
  safeLookup,
  safeHttpAgent,
  safeHttpsAgent,
  assertPublicHttpUrl,
  agentFor,
};
