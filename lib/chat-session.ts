import type { UIMessage } from 'ai';

export const CHAT_SESSION_KEY = 'ask-me-chat';
export const LOCALE_STORAGE_KEY = 'ask-me-locale';

function isStoredMessage(value: unknown): value is UIMessage {
  if (!value || typeof value !== 'object') return false;

  const message = value as Partial<UIMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
    Array.isArray(message.parts) &&
    message.parts.every(
      (part) => Boolean(part) && typeof part === 'object' && typeof part.type === 'string',
    )
  );
}

export function parseStoredMessages(value: string): UIMessage[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isStoredMessage)) return null;
    return parsed;
  } catch {
    return null;
  }
}
