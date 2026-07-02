import 'server-only';

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

const buckets = new Map<string, RateBucket>();

export function createRateLimiter(options: RateLimiterOptions) {
  const { maxAttempts, windowMs } = options;

  function consume(key: string): RateLimitResult {
    const now = Date.now();
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

  return { consume };
}

export function getRequestIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export function resetRateLimiter(key: string) {
  buckets.delete(key);
}