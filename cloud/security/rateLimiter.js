// cloud/security/rateLimiter.js
// Token-bucket rate limiter per connector/role scope.

const buckets = new Map();

function getBucketKey(scope) {
  return typeof scope === "string" ? scope : JSON.stringify(scope);
}

function initBucket(scope, capacity = 60, refillPerSec = 1) {
  const key = getBucketKey(scope);
  if (!buckets.has(key)) {
    buckets.set(key, { tokens: capacity, capacity, refillPerSec, lastRefill: Date.now() });
  }
  return buckets.get(key);
}

function allowRequest(scope, cost = 1) {
  const key    = getBucketKey(scope);
  const bucket = buckets.get(key);
  if (!bucket) return true; // no bucket = unlimited

  const now     = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  const refill  = Math.floor(elapsed * bucket.refillPerSec);

  if (refill > 0) {
    bucket.tokens    = Math.min(bucket.capacity, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return true;
  }
  return false;
}

function getBucketStatus(scope) {
  const key    = getBucketKey(scope);
  const bucket = buckets.get(key);
  if (!bucket) return null;
  return { tokens: bucket.tokens, capacity: bucket.capacity, refillPerSec: bucket.refillPerSec };
}

module.exports = { initBucket, allowRequest, getBucketKey, getBucketStatus };
