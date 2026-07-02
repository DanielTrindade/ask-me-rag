import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
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
    if (originHost !== new URL(request.url).host) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  await clearAdminSession();
  return NextResponse.redirect(new URL('/', request.url), 303);
}
