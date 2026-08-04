export type RateLimitConfig = {
  capacity: number; // max tokens in the bucket
  refillPerSecond: number; // token refill rate
};

const DEFAULT_CONFIG: RateLimitConfig = { capacity: 10, refillPerSecond: 2 };

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

/** Token-bucket rate limiter (hito 9.5). */
export function allowRate(agentId: string, config: RateLimitConfig = DEFAULT_CONFIG): boolean {
  const now = Date.now() / 1000;
  const bucket = buckets.get(agentId) ?? { tokens: config.capacity, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(config.capacity, bucket.tokens + elapsed * config.refillPerSecond);
  bucket.lastRefill = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(agentId, bucket);
    return true;
  }
  buckets.set(agentId, bucket);
  return false;
}

export function rateLimitStatus(agentId: string, config: RateLimitConfig = DEFAULT_CONFIG) {
  const bucket = buckets.get(agentId);
  if (!bucket) return { allowed: true, tokens: config.capacity, capacity: config.capacity };
  return {
    allowed: bucket.tokens >= 1,
    tokens: Math.round(bucket.tokens * 100) / 100,
    capacity: config.capacity,
  };
}
