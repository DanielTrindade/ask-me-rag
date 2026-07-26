import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PublicChatRequestError,
  createChatStatusDataPart,
  parsePublicChatStatusMessage,
  publicChatFetch,
  serializePublicChatStatus,
} from './chat-types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public chat protocol', () => {
  it('converte somente falhas públicas estruturadas em erro tipado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: 'temporarily_limited',
      message: 'Limite temporário.',
      retryable: false,
      resetAt: '2026-07-18T07:00:00Z',
    }, { status: 429 })));

    await expect(publicChatFetch('/api/chat')).rejects.toMatchObject({
      name: 'PublicChatRequestError',
      httpStatus: 429,
      failure: { error: 'temporarily_limited', message: 'Limite temporário.', retryable: false },
    } satisfies Partial<PublicChatRequestError>);
  });

  it('não interpreta corpo interno arbitrário como protocolo público', async () => {
    const response = Response.json({ error: 'database_secret' }, { status: 500 });
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(publicChatFetch('/api/chat')).resolves.toBe(response);
  });

  it('serializa resposta parcial e representa cache hit como data part', () => {
    const partial = { kind: 'partial', retryable: true } as const;
    expect(parsePublicChatStatusMessage(serializePublicChatStatus(partial))).toEqual(partial);
    expect(createChatStatusDataPart({ kind: 'cache_hit', retryable: false })).toMatchObject({
      type: 'data-chat-status',
      data: { kind: 'cache_hit', retryable: false },
    });
  });
});
