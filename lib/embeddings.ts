import 'server-only';

import { google } from '@ai-sdk/google';
import { embed, embedMany } from 'ai';
import { buildEmbeddingCacheKey, expiresAt } from '@/lib/ai/cache';
import { getEmbeddingCache, putEmbeddingCache } from '@/lib/ai/cache-store';
import { parseChatUsageConfig } from '@/lib/ai/governance-config';
import {
  AiRuntimeConfigurationError,
  type EmbeddingPurpose,
  type EmbeddingRuntime,
} from '@/lib/ai/runtime-contracts';
import { createVertexRuntimeProvider } from '@/lib/ai/vertex';

export const EMBEDDING_DIMENSION = 1536 as const;
export const DEFAULT_GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001';

type EnvSource = Readonly<Record<string, string | undefined>>;

export function resolveEmbeddingRuntime(env: EnvSource = process.env): EmbeddingRuntime {
  const provider = (env.EMBEDDING_PROVIDER ?? 'google').trim().toLowerCase();
  if (provider !== 'google' && provider !== 'vertex') {
    throw new AiRuntimeConfigurationError('embedding', 'EMBEDDING_PROVIDER');
  }

  if (provider === 'google' && !env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    throw new AiRuntimeConfigurationError('embedding', 'GOOGLE_GENERATIVE_AI_API_KEY');
  }

  const modelId = env.EMBEDDING_MODEL?.trim() || DEFAULT_GOOGLE_EMBEDDING_MODEL;
  if (modelId !== DEFAULT_GOOGLE_EMBEDDING_MODEL) {
    throw new AiRuntimeConfigurationError('embedding', 'EMBEDDING_MODEL');
  }

  const configuredDimension = env.EMBEDDING_DIMENSION?.trim();
  const dimension = configuredDimension ? Number(configuredDimension) : EMBEDDING_DIMENSION;
  if (dimension !== EMBEDDING_DIMENSION) {
    throw new AiRuntimeConfigurationError('embedding', 'EMBEDDING_DIMENSION');
  }

  const model = provider === 'vertex'
    ? createVertexRuntimeProvider('embedding', env).embeddingModel(modelId)
    : google.embedding(modelId);

  return {
    role: 'embedding',
    provider,
    modelId,
    displayName: modelId,
    dimension: EMBEDDING_DIMENSION,
    model,
    providerOptions: (purpose: EmbeddingPurpose) => ({
      google: {
        outputDimensionality: EMBEDDING_DIMENSION,
        taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
      },
    }),
    capabilities: {
      batching: true,
      purposeSpecific: true,
    },
  };
}

function assertCompatibleEmbedding(embedding: number[], expectedDimension: number) {
  if (embedding.length !== expectedDimension) {
    throw new AiRuntimeConfigurationError('embedding', 'EMBEDDING_DIMENSION');
  }
}

function embeddingCacheIdentity(
  text: string,
  runtime: EmbeddingRuntime,
  purpose: EmbeddingPurpose,
) {
  return buildEmbeddingCacheKey({
    text,
    provider: runtime.provider,
    model: runtime.modelId,
    dimension: runtime.dimension,
    purpose,
  });
}

async function readCachedEmbedding(cacheKey: string, dimension: number) {
  try {
    const embedding = await getEmbeddingCache(cacheKey);
    if (embedding) assertCompatibleEmbedding(embedding, dimension);
    return embedding;
  } catch {
    console.warn('[embedding-cache] read_failed', { category: 'store_unavailable' });
    return null;
  }
}

async function writeCachedEmbedding(input: Parameters<typeof putEmbeddingCache>[0]) {
  try {
    await putEmbeddingCache(input);
  } catch {
    console.warn('[embedding-cache] write_failed', { category: 'store_unavailable' });
  }
}

export async function embedText(
  text: string,
  purpose: EmbeddingPurpose = 'query',
): Promise<number[]> {
  const runtime = resolveEmbeddingRuntime();
  const cache = parseChatUsageConfig().cache;
  const identity = embeddingCacheIdentity(text, runtime, purpose);
  if (cache.embeddingEnabled) {
    const cached = await readCachedEmbedding(identity.cacheKey, runtime.dimension);
    if (cached) return cached;
  }

  const { embedding } = await embed({
    model: runtime.model,
    value: text,
    providerOptions: runtime.providerOptions(purpose),
  });
  assertCompatibleEmbedding(embedding, runtime.dimension);
  if (cache.embeddingEnabled) {
    await writeCachedEmbedding({
      ...identity,
      provider: runtime.provider,
      model: runtime.modelId,
      dimension: runtime.dimension,
      purpose,
      embedding,
      expiresAt: expiresAt(cache.embeddingTtlSeconds),
    });
  }
  return embedding;
}

export async function embedTexts(
  texts: string[],
  purpose: EmbeddingPurpose = 'document',
): Promise<number[][]> {
  const runtime = resolveEmbeddingRuntime();
  const cache = parseChatUsageConfig().cache;
  if (!cache.embeddingEnabled) {
    const { embeddings } = await embedMany({
      model: runtime.model,
      values: texts,
      providerOptions: runtime.providerOptions(purpose),
    });
    for (const embedding of embeddings) {
      assertCompatibleEmbedding(embedding, runtime.dimension);
    }
    return embeddings;
  }

  const identities = texts.map((text) => embeddingCacheIdentity(text, runtime, purpose));
  const results = await Promise.all(
    identities.map(({ cacheKey }) => readCachedEmbedding(cacheKey, runtime.dimension)),
  );
  const missingIndexes = results.flatMap((embedding, index) => embedding ? [] : [index]);
  if (missingIndexes.length > 0) {
    const { embeddings } = await embedMany({
      model: runtime.model,
      values: missingIndexes.map((index) => texts[index]),
      providerOptions: runtime.providerOptions(purpose),
    });
    if (embeddings.length !== missingIndexes.length) {
      throw new AiRuntimeConfigurationError('embedding', 'EMBEDDING_DIMENSION');
    }
    await Promise.all(embeddings.map(async (embedding, position) => {
      assertCompatibleEmbedding(embedding, runtime.dimension);
      const index = missingIndexes[position];
      results[index] = embedding;
      await writeCachedEmbedding({
        ...identities[index],
        provider: runtime.provider,
        model: runtime.modelId,
        dimension: runtime.dimension,
        purpose,
        embedding,
        expiresAt: expiresAt(cache.embeddingTtlSeconds),
      });
    }));
  }
  return results as number[][];
}
