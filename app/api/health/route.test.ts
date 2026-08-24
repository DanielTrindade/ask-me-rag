import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.fn();
const select = vi.fn(() => ({ limit }));
const from = vi.fn(() => ({ select }));
const { validateVertexAdc } = vi.hoisted(() => ({ validateVertexAdc: vi.fn() }));

vi.mock('@/lib/ai/vertex', () => ({
  usesVertex: () => process.env.EMBEDDING_PROVIDER === 'vertex',
  validateVertexAdc,
  createVertexRuntimeProvider: () => {
    const provider = (modelId: string) => ({ modelId });
    provider.embeddingModel = (modelId: string) => ({ modelId });
    return provider;
  },
}));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ from }),
}));

import { GET } from '@/app/api/health/route';

beforeEach(() => {
  vi.stubEnv('CHAT_LLM_PROVIDER', 'groq');
  vi.stubEnv('EMBEDDING_PROVIDER', 'google');
  vi.stubEnv('EMBEDDING_MODEL', 'gemini-embedding-001');
  vi.stubEnv('EMBEDDING_DIMENSION', '1536');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-placeholder');
  vi.stubEnv('GROQ_API_KEY', 'groq-placeholder');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'google-placeholder');
  vi.stubEnv('ADMIN_PASSWORD', 'a-production-safe-placeholder');
  limit.mockResolvedValue({ error: null, count: 1 });
  validateVertexAdc.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('returns ready without exposing dependency data', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(from).toHaveBeenCalledWith('schema_migrations');
    expect(select).toHaveBeenCalledWith('name', { head: true, count: 'exact' });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('returns a configuration category when required configuration is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(from).not.toHaveBeenCalled();
  });

  it('exige a chave do Groq sem fazer chamada externa', async () => {
    vi.stubEnv('GROQ_API_KEY', '');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(from).not.toHaveBeenCalled();
  });

  it('mantém o chat Groq independente do embedding Google', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('falha o health check do embedding Vertex quando ADC não está disponível', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', 'vertex');
    vi.stubEnv('EMBEDDING_VERTEX_PROJECT', 'project');
    vi.stubEnv('EMBEDDING_VERTEX_LOCATION', 'us-central1');
    validateVertexAdc.mockRejectedValueOnce(new Error('credential detail'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejeita provider de chat legado sem chamada faturável', async () => {
    vi.stubEnv('CHAT_LLM_PROVIDER', 'google');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejeita dimensão de embedding incompatível sem chamar o provider', async () => {
    vi.stubEnv('EMBEDDING_DIMENSION', '3072');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns a dependency category when Supabase is unavailable', async () => {
    limit.mockResolvedValue({ error: { message: 'sensitive database detail' }, count: null });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'dependency' });
  });

  it('returns a dependency category when Supabase exceeds the timeout', async () => {
    vi.useFakeTimers();
    limit.mockReturnValue(new Promise(() => undefined));

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(3_001);
    const response = await responsePromise;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'dependency' });
  });
});
