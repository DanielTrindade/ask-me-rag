import { createAdminSession, isAdminConfigured, isValidAdminPassword } from '@/lib/admin-session';

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return Response.json({ error: 'admin_not_configured' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!isValidAdminPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return Response.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  await createAdminSession();
  return Response.json({ ok: true });
}
