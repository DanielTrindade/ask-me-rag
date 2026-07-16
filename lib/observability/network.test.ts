import { describe, expect, it } from 'vitest';
import { getTrustedClientIp, maskIp, normalizeIp } from './network';

describe('observability network helpers', () => {
  it('normalizes IPv4, bracketed IPv6 and optional ports', () => {
    expect(normalizeIp(' 203.0.113.8:443 ')).toBe('203.0.113.8');
    expect(normalizeIp('[2001:db8::1]:8080')).toBe('2001:db8::1');
    expect(normalizeIp('not-an-ip')).toBeNull();
  });

  it('selects the client after skipping explicitly trusted right-side hops', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-forwarded-for': 'spoofed, 203.0.113.8, 35.1.2.3' },
    });
    expect(getTrustedClientIp(request, 1)).toBe('203.0.113.8');
    expect(getTrustedClientIp(request, 0)).toBe('35.1.2.3');
  });

  it('fails closed when configuration or candidates are invalid', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-forwarded-for': 'spoofed' },
    });
    expect(getTrustedClientIp(request, null)).toBe('unknown');
    expect(getTrustedClientIp(request, 1)).toBe('unknown');
    expect(getTrustedClientIp(request, 0)).toBe('unknown');
  });

  it('masks valid IP addresses', () => {
    expect(maskIp('203.0.113.8')).toBe('203.***.***.8');
    expect(maskIp('2001:db8::1')).toBe('2001:db8:…');
    expect(maskIp(null)).toBe('unknown');
  });
});

