import 'server-only';

import { createHash } from 'node:crypto';
import type { PortfolioUIMessage } from '@/lib/chat-types';

export const CHAT_PROMPT_REVISION = 'portfolio-chat-v2-grounded';

export function normalizeCacheText(text: string) {
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
}

export function sha256Text(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('base64url');
}

function hashFields(fields: Record<string, string | number>) {
  const canonical = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value).length}:${value}`)
    .join('|');
  return sha256Text(canonical);
}

export function buildResponseCacheKey(input: {
  question: string;
  locale: string;
  provider: string;
  model: string;
  promptRevision: string;
  knowledgeRevision: number;
}) {
  const questionHash = sha256Text(normalizeCacheText(input.question));
  return {
    questionHash,
    cacheKey: hashFields({
      kind: 'response',
      questionHash,
      locale: input.locale,
      provider: input.provider,
      model: input.model,
      promptRevision: input.promptRevision,
      knowledgeRevision: input.knowledgeRevision,
    }),
  };
}

export function isSharedResponseCacheEligible(messages: PortfolioUIMessage[]) {
  return messages.length === 1 && messages[0]?.role === 'user' &&
    messages[0].parts.length > 0 &&
    messages[0].parts.every((part) => part.type === 'text') &&
    messages[0].parts.some((part) => part.type === 'text' && part.text.trim().length > 0);
}

export function expiresAt(ttlSeconds: number, now = Date.now()) {
  return new Date(now + ttlSeconds * 1_000).toISOString();
}
