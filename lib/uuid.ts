export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function formatUuidV4(bytes: Uint8Array): string {
  // RFC 4122 §4.4: pin the version nibble to 4 and the variant bits to 10xx.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (const byte of bytes) hex.push(byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/**
 * crypto.randomUUID() only exists in secure contexts, so it is missing whenever
 * the app is served over plain HTTP — a phone hitting the dev server by IP, for
 * one. getRandomValues has no such restriction and carries the same entropy, so
 * it covers that case without weakening the identifier.
 */
export function createUuid(): string {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  if (typeof webCrypto?.getRandomValues === 'function') {
    return formatUuidV4(webCrypto.getRandomValues(new Uint8Array(16)));
  }

  // No Web Crypto at all. The identifier only groups messages of one
  // conversation for observability, so a non-cryptographic source is an
  // acceptable last resort to keep the chat usable.
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return formatUuidV4(bytes);
}
