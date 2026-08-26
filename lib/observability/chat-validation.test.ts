import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_TEXT_LENGTH, parseChatRequestBody } from './chat-validation';

const conversationId = '019f5cf7-0cc8-7d02-b252-4920e3c0861b';

describe('parseChatRequestBody', () => {
  it('accepts a valid conversation and returns the last user message', () => {
    const body = parseChatRequestBody({
      conversationId,
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Olá' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Oi' }] },
        { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Projetos?' }] },
      ],
    });
    expect(body.lastUser.id).toBe('u2');
  });

  it('aceita partes de UI emitidas pelo streaming e por respostas em cache', () => {
    const body = parseChatRequestBody({
      conversationId,
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Olá' }] },
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'data-chat-status',
              id: 'public-chat-status',
              data: { kind: 'cache_hit', retryable: false },
            },
            { type: 'text', text: 'Oi', state: 'done' },
          ],
        },
        { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Projetos?' }] },
      ],
    });

    expect(body.lastUser.id).toBe('u2');
  });

  it.each([
    [{ conversationId: 'invalid', messages: [] }, 'invalid_conversation_id'],
    [{ conversationId, messages: [] }, 'invalid_messages'],
    [{ conversationId, messages: [{ id: 'u1', role: 'user', parts: 'invalid' }] }, 'invalid_message'],
    [{
      conversationId,
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(MAX_MESSAGE_TEXT_LENGTH + 1) }] }],
    }, 'message_too_large'],
  ])('rejects invalid input with a safe category', (value, code) => {
    try {
      parseChatRequestBody(value);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toMatchObject({ code });
    }
  });

  it('rejeita uma mensagem Unicode acima do orçamento estimado antes da admissão', () => {
    expect(() => parseChatRequestBody({
      conversationId,
      messages: [{
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: '😀'.repeat(2_500) }],
      }],
    })).toThrow('message_token_budget_exceeded');
  });

  it('rejects unknown parts so private or high-entropy data cannot cross the boundary', () => {
    expect(() => parseChatRequestBody({
      conversationId,
      messages: [{
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Olá' }, { type: 'future-private-part', secret: 'x' }],
      }],
    })).toThrow('unsupported_message_part');
  });

  it('rejeita um status público malformado', () => {
    expect(() => parseChatRequestBody({
      conversationId,
      messages: [{
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Olá' },
          { type: 'data-chat-status', data: { kind: 'cache_hit', retryable: 'não' } },
        ],
      }],
    })).toThrow('invalid_chat_status_part');
  });
});
