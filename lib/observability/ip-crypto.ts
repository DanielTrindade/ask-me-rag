import 'server-only';

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export class TelemetryCryptoError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'TelemetryCryptoError';
  }
}

function decodeKey(value: string | undefined, code: string) {
  if (!value) throw new TelemetryCryptoError(code);
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) throw new TelemetryCryptoError(code);
  return key;
}

export function getIpHashKey() {
  return decodeKey(process.env.CHAT_IP_HMAC_KEY_BASE64, 'invalid_ip_hash_key');
}

export function getIpEncryptionKeyring() {
  const activeVersion = process.env.CHAT_IP_ACTIVE_KEY_VERSION;
  if (!activeVersion || !VERSION_PATTERN.test(activeVersion)) {
    throw new TelemetryCryptoError('invalid_ip_key_version');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(process.env.CHAT_IP_ENCRYPTION_KEYS_JSON ?? '');
  } catch {
    throw new TelemetryCryptoError('invalid_ip_keyring');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TelemetryCryptoError('invalid_ip_keyring');
  }
  const keys = new Map<string, Buffer>();
  for (const [version, encoded] of Object.entries(raw)) {
    if (!VERSION_PATTERN.test(version) || typeof encoded !== 'string') {
      throw new TelemetryCryptoError('invalid_ip_keyring');
    }
    keys.set(version, decodeKey(encoded, 'invalid_ip_keyring'));
  }
  if (!keys.has(activeVersion)) throw new TelemetryCryptoError('missing_active_ip_key');
  return { activeVersion, keys };
}

export function hashIp(ip: string, key = getIpHashKey()) {
  return createHmac('sha256', key).update(ip).digest('base64url');
}

export function encryptIp(ip: string, version: string, key: Buffer, iv = randomBytes(IV_BYTES)) {
  if (!VERSION_PATTERN.test(version) || key.length !== KEY_BYTES || iv.length !== IV_BYTES) {
    throw new TelemetryCryptoError('invalid_encryption_parameters');
  }
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(version));
  const ciphertext = Buffer.concat([cipher.update(ip, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

export function decryptIp(envelope: string, keys = getIpEncryptionKeyring().keys) {
  const [version, ivValue, ciphertextValue, tagValue, extra] = envelope.split('.');
  if (extra !== undefined || !version || !ivValue || !ciphertextValue || !tagValue) {
    throw new TelemetryCryptoError('invalid_ip_envelope');
  }
  const key = keys.get(version);
  if (!key) throw new TelemetryCryptoError('unknown_ip_key_version');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAAD(Buffer.from(version));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new TelemetryCryptoError('invalid_ip_envelope');
  }
}

export function protectIp(ip: string) {
  if (ip === 'unknown') return { ipHash: null, ipEncrypted: null };
  const keyring = getIpEncryptionKeyring();
  return {
    ipHash: hashIp(ip),
    ipEncrypted: encryptIp(ip, keyring.activeVersion, keyring.keys.get(keyring.activeVersion)!),
  };
}

