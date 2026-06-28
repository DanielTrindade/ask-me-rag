import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
  await clearAdminSession();
  return NextResponse.redirect(new URL('/', request.url), 303);
}
