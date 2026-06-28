import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_SESSION_COOKIE = 'askme_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 12;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

function sessionValue(password: string) {
  return createHmac('sha256', password).update('ask-me-admin-session-v1').digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminConfigured() {
  return getAdminPassword() !== null;
}

export function isValidAdminPassword(candidate: string) {
  const password = getAdminPassword();
  return password !== null && safeEqual(candidate, password);
}

export async function hasAdminSession() {
  const password = getAdminPassword();
  if (!password) return false;

  const cookieStore = await cookies();
  const candidate = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return Boolean(candidate && safeEqual(candidate, sessionValue(password)));
}

export async function createAdminSession() {
  const password = getAdminPassword();
  if (!password) throw new Error('ADMIN_PASSWORD is not configured');

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, sessionValue(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}
