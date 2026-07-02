import { NextResponse, type NextRequest } from 'next/server';

import { ADMIN_SESSION_COOKIE } from '@/lib/admin-constants';

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/ingest'],
};