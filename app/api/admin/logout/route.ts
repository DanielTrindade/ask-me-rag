import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await clearAdminSession();
  return NextResponse.redirect(new URL('/', request.url), 303);
}
