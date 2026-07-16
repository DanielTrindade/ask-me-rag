import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSession: vi.fn(),
  summary: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  reveal: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/admin-session', () => ({
  hasAdminSession: () => mocks.hasSession(),
}));

vi.mock('@/lib/observability/admin-store', () => ({
  getObservabilitySummary: (...args: unknown[]) => mocks.summary(...args),
  listObservabilityConversations: (...args: unknown[]) => mocks.list(...args),
  getObservabilityConversation: (...args: unknown[]) => mocks.detail(...args),
  revealConversationIp: (...args: unknown[]) => mocks.reveal(...args),
  deleteObservabilityConversation: (...args: unknown[]) => mocks.remove(...args),
  auditTelemetryAction: (...args: unknown[]) => mocks.audit(...args),
}));

import { GET as getSummary } from './summary/route';
import { GET as listConversations } from './conversations/route';
import { DELETE, GET as getConversation } from './conversations/[id]/route';
import { POST as revealIp } from './conversations/[id]/reveal-ip/route';

const id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6';
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasSession.mockResolvedValue(true);
  mocks.summary.mockResolvedValue({ conversations: 0 });
  mocks.list.mockResolvedValue({ conversations: [], hasMore: false });
  mocks.detail.mockResolvedValue(null);
  mocks.reveal.mockResolvedValue(null);
  mocks.remove.mockResolvedValue(false);
  mocks.audit.mockResolvedValue(undefined);
});

describe('admin observability routes', () => {
  it('requires an authenticated admin session in every handler', async () => {
    mocks.hasSession.mockResolvedValue(false);
    const getRequest = new Request('https://app.example/api/admin/observability/summary');
    const mutation = new Request(`https://app.example/api/admin/observability/conversations/${id}`, {
      method: 'DELETE', headers: { origin: 'https://app.example' },
    });
    expect((await getSummary(getRequest)).status).toBe(401);
    expect((await listConversations(getRequest)).status).toBe(401);
    expect((await getConversation(getRequest, context)).status).toBe(401);
    expect((await DELETE(mutation, context)).status).toBe(401);
    expect((await revealIp(mutation, context)).status).toBe(401);
  });

  it('validates summary ranges and represents the store payload without caching', async () => {
    const invalid = await getSummary(new Request(
      'https://app.example/api/admin/observability/summary?from=bad&to=also-bad',
    ));
    expect(invalid.status).toBe(400);

    const response = await getSummary(new Request(
      'https://app.example/api/admin/observability/summary?from=2026-07-12T00:00:00Z&to=2026-07-13T00:00:00Z',
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ summary: { conversations: 0 } });
  });

  it('returns cursor pagination and masked values supplied by the server store', async () => {
    mocks.list.mockResolvedValue({
      conversations: [{
        id, lastActivityAt: '2026-07-13T12:00:00.000Z', maskedIp: '203.***.***.20',
      }],
      hasMore: true,
    });
    const response = await listConversations(new Request(
      'https://app.example/api/admin/observability/conversations?limit=25',
    ));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.conversations[0].maskedIp).toBe('203.***.***.20');
    expect(payload.nextCursor).toEqual(expect.any(String));
  });

  it('uses a uniform 404 for missing, expired, or malformed conversations', async () => {
    expect((await getConversation(new Request('https://app.example/api'), context)).status).toBe(404);
    expect((await getConversation(new Request('https://app.example/api'), {
      params: Promise.resolve({ id: 'invalid' }),
    })).status).toBe(404);
  });

  it('rejects cross-origin reveal/delete and audits the denied action', async () => {
    const request = new Request(`https://app.example/api/admin/observability/conversations/${id}`, {
      method: 'POST', headers: { origin: 'https://attacker.example' },
    });
    expect((await revealIp(request, context)).status).toBe(403);
    expect(mocks.audit).toHaveBeenCalledWith('reveal_ip', id, 'denied_origin');
    expect((await DELETE(request, context)).status).toBe(403);
    expect(mocks.audit).toHaveBeenCalledWith('delete_conversation', id, 'denied_origin');
  });

  it('reveals one IP without cache, audits expiration, and deletes idempotently', async () => {
    const request = new Request(`https://app.example/api/admin/observability/conversations/${id}`, {
      method: 'POST', headers: { origin: 'https://app.example' },
    });
    const expired = await revealIp(request, context);
    expect(expired.status).toBe(410);
    expect(expired.headers.get('cache-control')).toContain('no-store');
    expect(mocks.audit).toHaveBeenCalledWith('reveal_ip', id, 'unavailable');

    mocks.reveal.mockResolvedValue('203.0.113.20');
    const revealed = await revealIp(request, context);
    expect(await revealed.json()).toEqual({ ip: '203.0.113.20' });
    expect(mocks.audit).toHaveBeenCalledWith('reveal_ip', id, 'revealed');

    mocks.remove.mockResolvedValue(false);
    const deleted = await DELETE(request, context);
    expect(await deleted.json()).toEqual({ deleted: false });
  });
});
