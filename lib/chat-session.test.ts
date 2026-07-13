import { describe, expect, it } from 'vitest';
import { parseStoredMessages } from './chat-session';

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
