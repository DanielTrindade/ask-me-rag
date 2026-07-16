import 'server-only';

import { getTrustedClientIp } from '@/lib/observability/network';

interface RateBucket {
  attempts: number;
  resetAt: number;
}

interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

// Once the map grows past this, expired buckets are swept on the next
// consume() so spoofed identifiers cannot grow memory without bound.
const PRUNE_THRESHOLD = 1_000;

export function createRateLimiter(options: RateLimiterOptions) {
  const { maxAttempts, windowMs } = options;
  const buckets = new Map<string, RateBucket>();

  function prune(now: number) {
    if (buckets.size < PRUNE_THRESHOLD) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  function consume(key: string): RateLimitResult {
    const now = Date.now();
    prune(now);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { attempts: 1, resetAt: now + windowMs });
      return { ok: true, remaining: maxAttempts - 1, retryAfterMs: 0 };
    }

    bucket.attempts += 1;
    if (bucket.attempts > maxAttempts) {
      return {
        ok: false,
        remaining: 0,
        retryAfterMs: bucket.resetAt - now,
      };
    }

    return {
      ok: true,
      remaining: maxAttempts - bucket.attempts,
      retryAfterMs: 0,
    };
  }

  function reset(key: string) {
    buckets.delete(key);
  }

  return { consume, reset };
}

export function getRequestIdentifier(req: Request): string {
  return getTrustedClientIp(req);
}
