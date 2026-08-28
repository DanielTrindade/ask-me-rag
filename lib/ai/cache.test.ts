import { describe, expect, it } from 'vitest';
import {
  buildResponseCacheKey,
  CHAT_PROMPT_REVISION,
  isSharedResponseCacheEligible,
  normalizeCacheText,
} from './cache';

describe('AI cache keys', () => {
  it('usa a revisão da política fundamentada', () => {
    expect(CHAT_PROMPT_REVISION).toBe('portfolio-chat-v3-question-locale');
  });

  it('normaliza pergunta sem armazenar texto bruto na chave', () => {
    expect(normalizeCacheText('  OLÁ\n mundo  ')).toBe('olá mundo');
    const first = buildResponseCacheKey({
      question: ' OLÁ  mundo ', locale: 'pt', provider: 'google', model: 'flash',
      promptRevision: 'v1', knowledgeRevision: 1,
    });
    const equivalent = buildResponseCacheKey({
      question: 'olá mundo', locale: 'pt', provider: 'google', model: 'flash',
      promptRevision: 'v1', knowledgeRevision: 1,
    });
    expect(first).toEqual(equivalent);
    expect(first.cacheKey).not.toContain('olá');
  });

  it.each(['locale', 'model', 'promptRevision', 'knowledgeRevision'] as const)(
    'altera a chave de resposta quando %s muda',
    (field) => {
      const base = {
        question: 'Projetos?', locale: 'pt', provider: 'google', model: 'flash',
        promptRevision: 'v1', knowledgeRevision: 1,
      };
      const changed = {
        ...base,
        [field]: field === 'knowledgeRevision' ? 2 : `${base[field]}-changed`,
      };
      expect(buildResponseCacheKey(base).cacheKey)
        .not.toBe(buildResponseCacheKey(changed).cacheKey);
    },
  );
});

describe('shared response cache eligibility', () => {
  it('aceita somente primeiro turno textual completo', () => {
    expect(isSharedResponseCacheEligible([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Projetos?' }] },
    ])).toBe(true);
    expect(isSharedResponseCacheEligible([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Oi' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Olá' }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Projetos?' }] },
    ])).toBe(false);
  });
});
