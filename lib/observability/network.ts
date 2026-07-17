import 'server-only';

import { isIP } from 'node:net';
import { getTrustedProxyHops } from '@/lib/observability/config';

function stripPort(value: string) {
  const candidate = value.trim();
  const bracketed = candidate.match(/^\[([^\]]+)](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  const ipv4WithPort = candidate.match(/^([^:]+):(\d+)$/);
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1];
  return candidate;
}

function canonicalizeIp(candidate: string, family: number) {
  if (family === 4) {
    return candidate.split('.').map((part) => String(Number(part))).join('.');
  }

  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = stripPort(value);
  const family = isIP(candidate);
  if (candidate.length > 45 || family === 0) return null;
  return canonicalizeIp(candidate, family);
}

export function getTrustedClientIp(req: Request, trustedProxyHops = getTrustedProxyHops()) {
  if (trustedProxyHops === null) return 'unknown';
  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const chain = forwarded.split(',').map((part) => part.trim());
  const index = chain.length - 1 - trustedProxyHops;
  if (index < 0) return 'unknown';
  return normalizeIp(chain[index]) ?? 'unknown';
}

export function maskIp(value: string | null | undefined) {
  const ip = normalizeIp(value);
  if (!ip) return 'unknown';
  if (isIP(ip) === 4) {
    const parts = ip.split('.');
    return `${parts[0]}.***.***.${parts[3]}`;
  }
  if (ip.startsWith('::ffff:')) return '::ffff:…';
  const parts = ip.split(':').filter(Boolean);
  return `${parts.slice(0, 2).join(':')}:…`;
}

