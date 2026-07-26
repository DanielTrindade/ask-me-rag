import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRuntimeConfigurationError } from '@/lib/ai/runtime-contracts';

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
  getEmbeddingCache: vi.fn(),
  putEmbeddingCache: vi.fn(),
}));

vi.mock('@/lib/ai/cache-store', () => ({
  getEmbeddingCache: (key: string) => mocks.getEmbeddingCache(key),
  putEmbeddingCache: (input: unknown) => mocks.putEmbeddingCache(input),
}));

vi.mock('ai', () => ({
  embed: mocks.embed,
  embedMany: mocks.embedMany,
}));

import {
  EMBEDDING_DIMENSION,
  embedText,
  embedTexts,
  resolveEmbeddingRuntime,
} from '@/lib/embeddings';

const googleEnv = {
  NODE_ENV: 'test',
  GOOGLE_GENERATIVE_AI_API_KEY: 'google-placeholder',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'google-placeholder');
  vi.stubEnv('EMBEDDING_PROVIDER', 'google');
  vi.stubEnv('EMBEDDING_MODEL', 'gemini-embedding-001');
  vi.stubEnv('EMBEDDING_DIMENSION', '1536');
  vi.stubEnv('CHAT_EMBEDDING_CACHE_ENABLED', 'false');
  mocks.getEmbeddingCache.mockResolvedValue(null);
  mocks.putEmbeddingCache.mockResolvedValue(undefined);
});

describe('resolveEmbeddingRuntime', () => {
  it('resolve Google com dimensão 1536 e opções por finalidade', () => {
    const runtime = resolveEmbeddingRuntime(googleEnv);

    expect(runtime).toMatchObject({
      role: 'embedding',
      provider: 'google',
      modelId: 'gemini-embedding-001',
      dimension: EMBEDDING_DIMENSION,
      capabilities: { batching: true, purposeSpecific: true },
    });
    expect(runtime.providerOptions('query')).toEqual({
      google: { outputDimensionality: 1536, taskType: 'RETRIEVAL_QUERY' },
    });
    expect(runtime.providerOptions('document')).toEqual({
      google: { outputDimensionality: 1536, taskType: 'RETRIEVAL_DOCUMENT' },
    });
  });

  it('resolve Vertex com embedding 1536 e sem exigir chave do AI Studio', () => {
    const runtime = resolveEmbeddingRuntime({
      EMBEDDING_PROVIDER: 'vertex',
      EMBEDDING_MODEL: 'gemini-embedding-001',
      EMBEDDING_DIMENSION: '1536',
      EMBEDDING_VERTEX_PROJECT: 'embedding-project',
      EMBEDDING_VERTEX_LOCATION: 'us-central1',
    });

    expect(runtime).toMatchObject({
      provider: 'vertex',
      modelId: 'gemini-embedding-001',
      dimension: 1536,
    });
    expect(runtime.providerOptions('query')).toEqual({
      google: { outputDimensionality: 1536, taskType: 'RETRIEVAL_QUERY' },
    });
  });

  it.each([
    ['EMBEDDING_PROVIDER', { EMBEDDING_PROVIDER: 'unknown' }],
    ['EMBEDDING_MODEL', { EMBEDDING_MODEL: 'incompatible-model' }],
    ['EMBEDDING_DIMENSION', { EMBEDDING_DIMENSION: '3072' }],
  ])('rejeita configuração incompatível em %s', (_variable, override) => {
    expect(() => resolveEmbeddingRuntime({ ...googleEnv, ...override })).toThrow(
      AiRuntimeConfigurationError,
    );
  });
});

describe('embedding operations', () => {
  it('aplica opções de consulta e documento nas operações do AI SDK', async () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.1);
    mocks.embed.mockResolvedValue({ embedding: vector });
    mocks.embedMany.mockResolvedValue({ embeddings: [vector] });

    await expect(embedText('consulta')).resolves.toHaveLength(EMBEDDING_DIMENSION);
    await expect(embedTexts(['documento'])).resolves.toEqual([vector]);

    expect(mocks.embed).toHaveBeenCalledWith(expect.objectContaining({
      value: 'consulta',
      providerOptions: {
        google: { outputDimensionality: 1536, taskType: 'RETRIEVAL_QUERY' },
      },
    }));
    expect(mocks.embedMany).toHaveBeenCalledWith(expect.objectContaining({
      values: ['documento'],
      providerOptions: {
        google: { outputDimensionality: 1536, taskType: 'RETRIEVAL_DOCUMENT' },
      },
    }));
  });

  it('reutiliza hit compatível sem chamar o provider', async () => {
    vi.stubEnv('CHAT_EMBEDDING_CACHE_ENABLED', 'true');
    const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.2);
    mocks.getEmbeddingCache.mockResolvedValueOnce(vector);
    await expect(embedText('consulta')).resolves.toBe(vector);
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.putEmbeddingCache).not.toHaveBeenCalled();
  });

  it('trata miss, persiste sem texto bruto e isola a finalidade', async () => {
    vi.stubEnv('CHAT_EMBEDDING_CACHE_ENABLED', 'true');
    const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.3);
    mocks.embed.mockResolvedValueOnce({ embedding: vector });
    await embedText('conteúdo privado', 'query');
    expect(mocks.putEmbeddingCache).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      model: 'gemini-embedding-001',
      dimension: 1536,
      purpose: 'query',
      embedding: vector,
    }));
    expect(JSON.stringify(mocks.putEmbeddingCache.mock.calls)).not.toContain('conteúdo privado');
  });

  it('não reutiliza vetor incompatível e busca um novo no provider', async () => {
    vi.stubEnv('CHAT_EMBEDDING_CACHE_ENABLED', 'true');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.4);
    mocks.getEmbeddingCache.mockResolvedValueOnce([0.1, 0.2]);
    mocks.embed.mockResolvedValueOnce({ embedding: vector });
    await expect(embedText('consulta')).resolves.toBe(vector);
    expect(mocks.embed).toHaveBeenCalledTimes(1);
    consoleWarn.mockRestore();
  });

  it('rejeita vetor com dimensão inesperada antes do pgvector', async () => {
    mocks.embed.mockResolvedValue({ embedding: [0.1, 0.2] });

    await expect(embedText('consulta')).rejects.toThrow(AiRuntimeConfigurationError);
  });
});
