import { describe, it, expect, vi, beforeEach } from 'vitest';

const clearAdminSession = vi.fn();
vi.mock('@/lib/admin-session', () => ({
  clearAdminSession: () => clearAdminSession(),
}));

import { POST } from '@/app/api/admin/logout/route';

function logoutRequest(headers: Record<string, string>) {
  // In Next standalone (Cloud Run), request.url carries the internal bind
  // address, not the public host — the public host only exists in headers.
  return new Request('http://0.0.0.0:8080/api/admin/logout', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/logout', () => {
  it('logs out when Origin matches the Host header (production scenario)', async () => {
    const response = await POST(
      logoutRequest({
        origin: 'https://ask.danieltrindade.dev',
        host: 'ask.danieltrindade.dev',
      }),
    );
    expect(response.status).toBe(303);
    expect(clearAdminSession).toHaveBeenCalled();
  });

  it('rejects a cross-origin request', async () => {
    const response = await POST(
      logoutRequest({ origin: 'https://evil.example', host: 'ask.danieltrindade.dev' }),
    );
    expect(response.status).toBe(403);
    expect(clearAdminSession).not.toHaveBeenCalled();
  });

  it('rejects an unparsable "null" origin', async () => {
    const response = await POST(
      logoutRequest({ origin: 'null', host: 'ask.danieltrindade.dev' }),
    );
    expect(response.status).toBe(403);
    expect(clearAdminSession).not.toHaveBeenCalled();
  });

  it('logs out when no Origin header is present', async () => {
    const response = await POST(logoutRequest({ host: 'ask.danieltrindade.dev' }));
    expect(response.status).toBe(303);
    expect(clearAdminSession).toHaveBeenCalled();
  });
});
