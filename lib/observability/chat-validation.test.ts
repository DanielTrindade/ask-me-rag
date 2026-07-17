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
});

