import { NextResponse, type NextRequest } from 'next/server';

import { ADMIN_SESSION_COOKIE } from '@/lib/admin-constants';
import { buildContentSecurityPolicy } from '@/lib/csp';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtectedAdminPage =
    pathname.startsWith('/admin') && pathname !== '/admin/login';
  const isProtectedIngest = pathname === '/api/ingest';

  if (isProtectedAdminPage || isProtectedIngest) {
    const session = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!session) {
      if (isProtectedIngest) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildContentSecurityPolicy(nonce);

  // Next.js reads the nonce from the request's CSP header and applies it to
  // the script tags it renders, so the header must be set on both sides.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Runs on every request except build assets so pages get their CSP nonce;
  // admin/ingest protection stays pathname-based above. Prefetch requests are
  // intentionally NOT excluded: skipping them would bypass the admin check.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
