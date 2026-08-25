import 'server-only';

import type { SourceReference } from '@/lib/chat-types';
import { getServiceClient } from '@/lib/supabase';

export class AiCacheStoreError extends Error {
  constructor(readonly operation: string) {
    super(`AI cache store unavailable: ${operation}`);
    this.name = 'AiCacheStoreError';
  }
}

export interface ResponseCacheEntry {
  responseText: string;
  sources: SourceReference[];
  provider: string;
  model: string;
  expiresAt: string;
}

function parseSources(value: unknown): SourceReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value.filter((source): source is SourceReference => Boolean(
    source && typeof source === 'object' &&
    typeof (source as SourceReference).name === 'string' &&
    Number.isInteger((source as SourceReference).matchedChunks) &&
    (source as SourceReference).matchedChunks > 0,
  ));
  return sources.length === value.length ? sources : undefined;
}

export async function getResponseCache(cacheKey: string): Promise<ResponseCacheEntry | null> {
  try {
    const { data, error } = await getServiceClient().rpc('get_chat_response_cache', {
      p_cache_key: cacheKey,
    });
    if (error) throw error;
    if (data === null) return null;
    if (!data || typeof data !== 'object') throw new Error('invalid_response_cache');
    const value = data as Record<string, unknown>;
    const sources = parseSources(value.sources);
    if (
      typeof value.responseText !== 'string' || !sources ||
      typeof value.provider !== 'string' || typeof value.model !== 'string' ||
      typeof value.expiresAt !== 'string'
    ) throw new Error('invalid_response_cache');
    return {
      responseText: value.responseText,
      sources,
      provider: value.provider,
      model: value.model,
      expiresAt: value.expiresAt,
    };
  } catch {
    throw new AiCacheStoreError('get_response');
  }
}

export async function putResponseCache(input: {
  cacheKey: string;
  questionHash: string;
  locale: string;
  provider: string;
  model: string;
  promptRevision: string;
  knowledgeRevision: number;
  responseText: string;
  sources: SourceReference[];
  expiresAt: string;
}) {
  try {
    const { error } = await getServiceClient().rpc('put_chat_response_cache', {
      p_cache_key: input.cacheKey,
      p_question_hash: input.questionHash,
      p_locale: input.locale,
      p_provider: input.provider,
      p_model: input.model,
      p_prompt_revision: input.promptRevision,
      p_knowledge_revision: input.knowledgeRevision,
      p_response_text: input.responseText,
      p_sources: input.sources,
      p_expires_at: input.expiresAt,
    });
    if (error) throw error;
  } catch {
    throw new AiCacheStoreError('put_response');
  }
}

export async function getKnowledgeRevision() {
  try {
    const { data, error } = await getServiceClient().rpc('get_chat_knowledge_revision');
    if (error || !Number.isSafeInteger(data) || data < 0) throw error ?? new Error('invalid_revision');
    return data as number;
  } catch {
    throw new AiCacheStoreError('get_revision');
  }
}

export async function incrementKnowledgeRevision() {
  try {
    const { data, error } = await getServiceClient().rpc('increment_chat_knowledge_revision');
    if (error || !Number.isSafeInteger(data) || data < 1) throw error ?? new Error('invalid_revision');
    return data as number;
  } catch {
    throw new AiCacheStoreError('increment_revision');
  }
}
