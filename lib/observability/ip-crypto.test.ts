import { describe, expect, it } from 'vitest';
import { decryptIp, encryptIp, hashIp, TelemetryCryptoError } from './ip-crypto';

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 9);

describe('IP protection', () => {
  it('creates stable HMAC values without exposing the IP', () => {
    const first = hashIp('203.0.113.8', key);
    expect(first).toBe(hashIp('203.0.113.8', key));
    expect(first).not.toContain('203.0.113.8');
    expect(first).not.toBe(hashIp('203.0.113.9', key));
  });

  it('encrypts and decrypts with a versioned AES-GCM envelope', () => {
    const envelope = encryptIp('2001:db8::1', 'v1', key, Buffer.alloc(12, 3));
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(decryptIp(envelope, new Map([['v1', key]]))).toBe('2001:db8::1');
  });

  it('supports rotation while retained versions remain available', () => {
    const oldEnvelope = encryptIp('203.0.113.8', 'v1', key);
    const newEnvelope = encryptIp('203.0.113.9', 'v2', otherKey);
    const keys = new Map([['v1', key], ['v2', otherKey]]);
    expect(decryptIp(oldEnvelope, keys)).toBe('203.0.113.8');
    expect(decryptIp(newEnvelope, keys)).toBe('203.0.113.9');
  });

  it('rejects tampering and unknown key versions with safe error codes', () => {
    const envelope = encryptIp('203.0.113.8', 'v1', key);
    const parts = envelope.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
    expect(() => decryptIp(parts.join('.'), new Map([['v1', key]]))).toThrow(
      TelemetryCryptoError,
    );
    expect(() => decryptIp(envelope, new Map())).toThrowError('unknown_ip_key_version');
  });
});

