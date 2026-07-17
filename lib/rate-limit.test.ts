import { describe, expect, it } from 'vitest';
import { getRequestIdentifier } from './rate-limit';

describe('getRequestIdentifier', () => {
  it('uses the nearest validated proxy entry independently of observability config', () => {
    const request = new Request('https://example.test', {
      headers: {
        'x-forwarded-for': 'spoofed, 203.0.113.8, 35.1.2.3',
      },
    });

    expect(getRequestIdentifier(request)).toBe('35.1.2.3');
  });

  it('falls back to a validated x-real-ip value', () => {
    const request = new Request('https://example.test', {
      headers: {
        'x-forwarded-for': 'invalid',
        'x-real-ip': '203.0.113.9',
      },
    });

    expect(getRequestIdentifier(request)).toBe('203.0.113.9');
  });
});
