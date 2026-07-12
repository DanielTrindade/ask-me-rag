import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
  // In Next standalone (Cloud Run), request.url carries the internal bind
  // address (0.0.0.0:8080), so the public host must come from headers.
  const requestHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  const origin = request.headers.get('origin');
  if (origin) {
    // Browsers send the literal "null" origin from sandboxed iframes and some
    // redirects; URL parsing fails for it, so fail closed on any parse error.
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!requestHost || originHost !== requestHost) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  await clearAdminSession();
  // Relative Location keeps the redirect on whatever public host served the
  // request instead of the internal one in request.url.
  return new NextResponse(null, { status: 303, headers: { Location: '/' } });
}
