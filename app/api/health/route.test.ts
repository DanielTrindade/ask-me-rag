import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ rpc }),
}));

import { GET } from '@/app/api/health/route';

beforeEach(() => {
  vi.stubEnv('CHAT_LLM_PROVIDER', 'groq');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-placeholder');
  vi.stubEnv('GROQ_API_KEY', 'groq-placeholder');
  vi.stubEnv('ADMIN_PASSWORD', 'a-production-safe-placeholder');
  rpc.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('retorna ready e exercita o RPC FTS sem expor dados', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(rpc).toHaveBeenCalledWith('search_documents_v2', {
      query_text: 'healthcheck',
      query_expansion: '',
      query_language: 'english',
      match_count: 1,
    });
  });

  it('retorna categoria de configuração quando falta variável obrigatória', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('exige a chave do Groq sem fazer chamada externa', async () => {
    vi.stubEnv('GROQ_API_KEY', '');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejeita provider de chat legado sem consultar o banco', async () => {
    vi.stubEnv('CHAT_LLM_PROVIDER', 'google');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('retorna categoria de dependência quando o FTS está indisponível', async () => {
    rpc.mockResolvedValue({ error: { message: 'sensitive database detail' }, data: null });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'dependency' });
  });

  it('retorna categoria de dependência quando o FTS excede o timeout', async () => {
    vi.useFakeTimers();
    rpc.mockReturnValue(new Promise(() => undefined));

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(3_001);
    const response = await responsePromise;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'dependency' });
  });
});
