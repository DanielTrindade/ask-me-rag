import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import { ADMIN_SESSION_COOKIE } from '@/lib/admin-constants';

export { ADMIN_SESSION_COOKIE };

const SESSION_MAX_AGE = 60 * 60 * 12;
const MIN_PASSWORD_LENGTH = 20;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

function assertPasswordStrength(password: string) {
  if (
    process.env.NODE_ENV === 'production' &&
    password.length < MIN_PASSWORD_LENGTH
  ) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters in production`,
    );
  }
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
  assertPasswordStrength(password);

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