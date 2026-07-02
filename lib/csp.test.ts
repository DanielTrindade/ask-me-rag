import { describe, it, expect } from 'vitest';
import { buildContentSecurityPolicy } from '@/lib/csp';

describe('buildContentSecurityPolicy', () => {
  it('allows scripts carrying the request nonce', () => {
    const csp = buildContentSecurityPolicy('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('never allows unsafe-eval in production', () => {
    const csp = buildContentSecurityPolicy('abc123', false);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('allows unsafe-eval and websockets in development (Turbopack HMR)', () => {
    const csp = buildContentSecurityPolicy('abc123', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
  });

  it('keeps the hardening directives from the static policy', () => {
    const csp = buildContentSecurityPolicy('abc123', false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('produces a single-line, semicolon-delimited header value', () => {
    const csp = buildContentSecurityPolicy('abc123', false);
    expect(csp).not.toMatch(/\n/);
    expect(csp.split('; ').length).toBeGreaterThan(5);
  });
});
