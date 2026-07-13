import { NextResponse, type NextRequest } from 'next/server';

import { ADMIN_SESSION_COOKIE } from '@/lib/admin-constants';
import { buildNonceContentSecurityPolicy, isAdminDocumentPath } from '@/lib/csp';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminDocument = isAdminDocumentPath(pathname);
  const isProtectedAdminPage = isAdminDocument && pathname !== '/admin/login';
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

  if (!isAdminDocument) {
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildNonceContentSecurityPolicy(nonce);

  // Next.js extracts the nonce from the request policy and applies it to the
  // bootstrap scripts rendered for the dynamic admin segment.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Public pages bypass Proxy entirely and keep their static rendering path.
  // Admin documents need nonce injection; ingest only needs the auth guard.
  matcher: ['/admin/:path*', '/api/ingest'],
};
