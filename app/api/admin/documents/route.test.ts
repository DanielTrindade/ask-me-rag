import { describe, it, expect, vi, beforeEach } from 'vitest';

const hasAdminSession = vi.fn();
vi.mock('@/lib/admin-session', () => ({
  hasAdminSession: () => hasAdminSession(),
}));

const rpc = vi.fn();
const deleteFilter = vi.fn();
const deleteFn = vi.fn(() => ({ filter: deleteFilter }));
const from = vi.fn(() => ({ delete: deleteFn }));
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ rpc, from }),
}));

import { GET, DELETE } from '@/app/api/admin/documents/route';

function deleteRequest(query: string) {
  return new Request(`http://localhost/api/admin/documents${query}`, { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasAdminSession.mockResolvedValue(true);
});

describe('GET /api/admin/documents', () => {
  it('returns 401 without an admin session', async () => {
    hasAdminSession.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('maps RPC rows to camelCase documents', async () => {
    rpc.mockResolvedValue({
      data: [{ source: 'cv.md', chunk_count: 4, last_ingested_at: '2026-07-09T12:00:00Z' }],
      error: null,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('list_document_sources');
    expect(await response.json()).toEqual({
      documents: [{ source: 'cv.md', chunkCount: 4, lastIngestedAt: '2026-07-09T12:00:00Z' }],
    });
  });

  it('returns 500 when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const response = await GET();
    expect(response.status).toBe(500);
  });
});

describe('DELETE /api/admin/documents', () => {
  it('returns 401 without an admin session', async () => {
    hasAdminSession.mockResolvedValue(false);
    const response = await DELETE(deleteRequest('?source=cv.pdf'));
    expect(response.status).toBe(401);
  });

  it('returns 400 when source is missing or blank', async () => {
    expect((await DELETE(deleteRequest(''))).status).toBe(400);
    expect((await DELETE(deleteRequest('?source=%20'))).status).toBe(400);
  });

  it('deletes by metadata source and reports the count', async () => {
    deleteFilter.mockResolvedValue({ error: null, count: 7 });
    const response = await DELETE(deleteRequest('?source=cv.pdf'));
    expect(response.status).toBe(200);
    expect(deleteFn).toHaveBeenCalledWith({ count: 'exact' });
    expect(deleteFilter).toHaveBeenCalledWith('metadata->>source', 'eq', 'cv.pdf');
    expect(await response.json()).toEqual({ deleted: 7 });
  });

  it('returns 500 when the delete fails', async () => {
    deleteFilter.mockResolvedValue({ error: { message: 'boom' }, count: null });
    const response = await DELETE(deleteRequest('?source=cv.pdf'));
    expect(response.status).toBe(500);
  });
});
