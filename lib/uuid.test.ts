import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid, isUuid } from './uuid';

const realCrypto = globalThis.crypto;

function stubCrypto(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  stubCrypto(realCrypto);
  vi.restoreAllMocks();
});

describe('createUuid', () => {
  it('uses randomUUID when the page is a secure context', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    stubCrypto({ randomUUID, getRandomValues: realCrypto.getRandomValues });

    expect(createUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  // A phone loading the dev server over http:// by IP: window.crypto exists but
  // randomUUID does not, which used to throw on mount and take the chat down.
  it('falls back to getRandomValues outside a secure context', () => {
    const getRandomValues = vi.fn((array: Uint8Array) => {
      array.fill(0xff);
      return array;
    });
    stubCrypto({ getRandomValues });

    const id = createUuid();

    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(isUuid(id)).toBe(true);
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('still returns a valid identifier with no Web Crypto at all', () => {
    stubCrypto(undefined);

    const id = createUuid();

    expect(isUuid(id)).toBe(true);
  });

  it('produces distinct identifiers across calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createUuid()));
    expect(ids.size).toBe(200);
  });
});
