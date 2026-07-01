import { describe, it, expect } from 'vitest';
import { sha256 } from '@/lib/hash';

describe('sha256', () => {
  it('returns a deterministic hex digest for identical input', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('returns different digests for different input', () => {
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('returns a 64-character hex string', () => {
    expect(sha256('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});