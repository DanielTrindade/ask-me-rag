import { describe, expect, it } from 'vitest';
import { parseStoredConversationId, parseStoredMessages, restoreOrCreateConversationId } from './chat-session';

describe('parseStoredMessages', () => {
  it('restores a valid UI message history', () => {
    const stored = JSON.stringify([
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Olá' }] },
      { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Oi!' }] },
    ]);

    expect(parseStoredMessages(stored)).toHaveLength(2);
  });

  it('rejects malformed JSON', () => {
    expect(parseStoredMessages('{')).toBeNull();
  });

  it('rejects arrays containing incompatible messages', () => {
    const stored = JSON.stringify([{ id: 'broken', role: 'user', parts: 'texto' }]);

    expect(parseStoredMessages(stored)).toBeNull();
  });
});


describe('parseStoredConversationId', () => {
  it('accepts a valid UUID and rejects arbitrary identifiers', () => {
    const id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6';

    expect(parseStoredConversationId(id)).toBe(id);
    expect(parseStoredConversationId('conversation-1')).toBeNull();
    expect(parseStoredConversationId(null)).toBeNull();
  });

  it('restores a valid id and renews an invalid stored value', () => {
    const id = '92adfc13-1686-4b5f-b6f2-f786bfd21dd6';
    const renewed = '019f5cf7-0cc8-7d02-b252-4920e3c0861b';

    expect(restoreOrCreateConversationId(id, () => renewed)).toBe(id);
    expect(restoreOrCreateConversationId('broken', () => renewed)).toBe(renewed);
  });

});
