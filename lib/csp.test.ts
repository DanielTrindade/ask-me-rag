import { describe, it, expect } from 'vitest';
import {
  buildNonceContentSecurityPolicy,
  buildStaticContentSecurityPolicy,
  isAdminDocumentPath,
} from '@/lib/csp';

describe('buildNonceContentSecurityPolicy', () => {
  it('allows scripts carrying the request nonce', () => {
    const csp = buildNonceContentSecurityPolicy('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('never allows unsafe-eval in production', () => {
    const csp = buildNonceContentSecurityPolicy('abc123', false);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('allows unsafe-eval and websockets in development (Turbopack HMR)', () => {
    const csp = buildNonceContentSecurityPolicy('abc123', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
  });

  it('keeps the hardening directives from the static policy', () => {
    const csp = buildNonceContentSecurityPolicy('abc123', false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('produces a single-line, semicolon-delimited header value', () => {
    const csp = buildNonceContentSecurityPolicy('abc123', false);
    expect(csp).not.toMatch(/\n/);
    expect(csp.split('; ').length).toBeGreaterThan(5);
  });
});


describe('buildStaticContentSecurityPolicy', () => {
  it('allows the Next.js bootstrap without a per-request nonce', () => {
    const csp = buildStaticContentSecurityPolicy(false);

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'nonce-");
    expect(csp).not.toContain("'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('keeps development HMR support isolated to development', () => {
    const csp = buildStaticContentSecurityPolicy(true);

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
  });
});

describe('isAdminDocumentPath', () => {
  it('limits nonce-based CSP to admin documents', () => {
    expect(isAdminDocumentPath('/admin')).toBe(true);
    expect(isAdminDocumentPath('/admin/login')).toBe(true);
    expect(isAdminDocumentPath('/')).toBe(false);
    expect(isAdminDocumentPath('/api/chat')).toBe(false);
    expect(isAdminDocumentPath('/api/ingest')).toBe(false);
  });
});
