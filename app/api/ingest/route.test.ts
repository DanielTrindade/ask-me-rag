import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  extract: vi.fn(),
  chunk: vi.fn(),
  fresh: vi.fn(),
  filter: vi.fn(),
  insert: vi.fn(),
  increment: vi.fn(),
}));

vi.mock('@/lib/admin-session', () => ({ hasAdminSession: () => mocks.admin() }));
vi.mock('@/lib/extract', () => ({ extractText: (file: File) => mocks.extract(file) }));
vi.mock('@/lib/chunk', () => ({ chunkText: (text: string) => mocks.chunk(text) }));
vi.mock('@/lib/dedup', () => ({
  selectFresh: (hashes: Set<string>, chunks: unknown[], source: string) =>
    mocks.fresh(hashes, chunks, source),
}));
vi.mock('@/lib/ai/cache-store', () => ({
  incrementKnowledgeRevision: () => mocks.increment(),
}));
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ filter: mocks.filter }),
      insert: mocks.insert,
    }),
  }),
}));

import { POST } from './route';

function request() {
  const form = new FormData();
  form.set('file', new File(['conteúdo'], 'cv.md', { type: 'text/markdown' }));
  return { formData: async () => form } as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(true);
  mocks.extract.mockResolvedValue('conteúdo');
  mocks.chunk.mockReturnValue([{ content: 'conteúdo', index: 0 }]);
  mocks.filter.mockResolvedValue({ data: [], error: null });
  mocks.fresh.mockReturnValue([{
    chunk: { content: 'conteúdo', index: 0 }, hash: 'hash-do-chunk',
  }]);
  mocks.insert.mockResolvedValue({ error: null, count: 1 });
  mocks.increment.mockResolvedValue(2);
});

describe('POST /api/ingest knowledge revision', () => {
  it('incrementa a revisão somente após inserir chunks', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inserted: 1, skipped: 0 });
    expect(mocks.insert).toHaveBeenCalledWith([{
      content: 'conteúdo',
      metadata: {
        source: 'cv.md',
        chunk: 0,
        chunk_hash: 'hash-do-chunk',
      },
    }]);
    expect(mocks.increment).toHaveBeenCalledTimes(1);
  });

  it('preserva a revisão quando todos os chunks já existem', async () => {
    mocks.fresh.mockReturnValueOnce([]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inserted: 0, skipped: 1 });
    expect(mocks.increment).not.toHaveBeenCalled();
  });
});
