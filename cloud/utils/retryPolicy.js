// cloud/utils/retryPolicy.js
'use strict';

function _jitter(mode, base) {
  if (mode === 'full')  return Math.random() * base;
  if (mode === 'equal') return base / 2 + Math.random() * (base / 2);
  return base; // none
}

function calcDelay(policy, attempt) {
  const base = Math.min(
    policy.baseDelayMs * Math.pow(2, attempt - 1),
    policy.maxDelayMs
  );
  return Math.floor(_jitter(policy.jitter || 'full', base));
}

/**
 * withRetry
 * Wraps an async fn with exponential backoff + jitter.
 * Throws after maxAttempts exhausted.
 *
 * @param {Function} fn          - async function to retry
 * @param {Object}   policy      - { maxAttempts, baseDelayMs, maxDelayMs, jitter }
 * @param {Function} [onRetry]   - called(attempt, err) before each retry delay
 */
async function withRetry(fn, policy = {}, onRetry) {
  const maxAttempts = policy.maxAttempts ?? 3;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        if (onRetry) onRetry(attempt, err);
        const delay = calcDelay(policy, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastErr;
}

module.exports = { withRetry, calcDelay };
