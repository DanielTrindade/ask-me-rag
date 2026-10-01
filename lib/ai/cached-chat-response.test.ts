import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamOptions: null as {
    execute: (context: { writer: { write: (part: unknown) => void } }) => void;
  } | null,
}));

vi.mock('ai', () => ({
  createUIMessageStream: vi.fn((options) => {
    mocks.streamOptions = options;
    return { kind: 'mock-stream' };
  }),
  createUIMessageStreamResponse: vi.fn(() => new Response('stream')),
}));

import { createCachedChatResponse } from '@/lib/ai/cached-chat-response';

function renderParts(status?: { kind: 'cache_hit'; retryable: false }) {
  createCachedChatResponse({
    originalMessages: [],
    responseText: 'Resposta',
    messageId: 'assistant-1',
    status,
  });

  const parts: unknown[] = [];
  mocks.streamOptions?.execute({ writer: { write: (part) => void parts.push(part) } });
  return parts;
}

describe('createCachedChatResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamOptions = null;
  });

  it('omite data-chat-status quando nenhum status público é fornecido', () => {
    expect(renderParts()).not.toContainEqual(expect.objectContaining({
      type: 'data-chat-status',
    }));
  });

  it('nunca emite data-sources, mesmo que o chamador ainda forneça fontes', () => {
    createCachedChatResponse({
      originalMessages: [],
      responseText: 'Resposta',
      messageId: 'assistant-1',
      // Extra property on purpose: legacy callers must not be able to leak sources.
      ...({ sources: [{ name: 'cv.md', matchedChunks: 2 }] } as object),
    });
    const parts: unknown[] = [];
    mocks.streamOptions?.execute({ writer: { write: (part) => void parts.push(part) } });

    expect(parts.map((part) => (part as { type: string }).type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
    ]);
  });

  it('preserva o status explícito de cache hit', () => {
    expect(renderParts({ kind: 'cache_hit', retryable: false })).toContainEqual({
      type: 'data-chat-status',
      id: 'public-chat-status',
      data: { kind: 'cache_hit', retryable: false },
    });
  });
});
