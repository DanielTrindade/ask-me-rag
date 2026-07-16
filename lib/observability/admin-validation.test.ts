import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AdminObservabilityValidationError,
  assertConversationId,
  encodeConversationCursor,
  isSameOrigin,
  parseConversationFilters,
  parseDateRange,
} from './admin-validation';

describe('admin observability validation', () => {
  const originalKey = process.env.CHAT_IP_HMAC_KEY_BASE64;

  beforeEach(() => {
    process.env.CHAT_IP_HMAC_KEY_BASE64 = Buffer.alloc(32, 4).toString('base64');
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CHAT_IP_HMAC_KEY_BASE64;
    else process.env.CHAT_IP_HMAC_KEY_BASE64 = originalKey;
  });

  it('applies a 24-hour default range and limits ranges to 90 days', () => {
    const now = new Date('2026-07-13T12:00:00.000Z');
    expect(parseDateRange(new URLSearchParams(), now)).toEqual({
      from: '2026-07-12T12:00:00.000Z',
      to: '2026-07-13T12:00:00.000Z',
    });
    expect(() => parseDateRange(new URLSearchParams({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-07-13T00:00:00.000Z',
    }))).toThrow(AdminObservabilityValidationError);
  });

  it('round-trips a cursor and hashes a normalized IP server-side', () => {
    const id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6';
    const cursor = encodeConversationCursor('2026-07-13T12:00:00.000Z', id);
    const filters = parseConversationFilters(new URLSearchParams({
      cursor,
      ip: '203.0.113.20',
      status: 'completed',
    }));

    expect(filters.cursorId).toBe(id);
    expect(filters.ipHash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(filters.status).toBe('completed');
  });

  it('rejects invalid UUIDs, cursors, filters, and cross-origin mutations', () => {
    expect(() => assertConversationId('conversation-1')).toThrow();
    expect(() => parseConversationFilters(new URLSearchParams({ cursor: 'broken' })))
      .toThrow('invalid_cursor');
    expect(() => parseConversationFilters(new URLSearchParams({ status: 'other' })))
      .toThrow('invalid_status');
    expect(isSameOrigin(new Request('https://app.example/api', {
      headers: { origin: 'https://attacker.example' },
    }))).toBe(false);
    expect(isSameOrigin(new Request('https://app.example/api', {
      headers: { origin: 'https://app.example' },
    }))).toBe(true);
  });
});
