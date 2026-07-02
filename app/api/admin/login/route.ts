import {
  createAdminSession,
  isAdminConfigured,
  isValidAdminPassword,
} from '@/lib/admin-session';
import { createRateLimiter, getRequestIdentifier } from '@/lib/rate-limit';

const loginLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return Response.json({ error: 'admin_not_configured' }, { status: 503 });
  }

  const identifier = getRequestIdentifier(request);
  const { ok, remaining, retryAfterMs } = loginLimiter.consume(identifier);
  if (!ok) {
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return Response.json(
      { error: 'too_many_attempts' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!isValidAdminPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return Response.json({ error: 'invalid_credentials', remaining }, { status: 401 });
  }

  try {
    await createAdminSession();
  } catch (error) {
    console.error('[/api/admin/login] session creation failed:', error);
    return Response.json({ error: 'admin_not_configured' }, { status: 503 });
  }

  loginLimiter.reset(identifier);
  return Response.json({ ok: true });
}
