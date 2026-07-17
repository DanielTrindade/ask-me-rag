import type { PortfolioUIMessage } from '@/lib/chat-types';
import { isUuid } from '@/lib/uuid';

export const CHAT_SESSION_KEY = 'ask-me-chat';
export const CHAT_CONVERSATION_ID_KEY = 'ask-me-chat-conversation-id';
export const LOCALE_STORAGE_KEY = 'ask-me-locale';


export function parseStoredConversationId(value: string | null) {
  return isUuid(value) ? value : null;
}

export function createChatConversationId() {
  return crypto.randomUUID();
}

export function restoreOrCreateConversationId(
  storedValue: string | null,
  create: () => string = createChatConversationId,
) {
  return parseStoredConversationId(storedValue) ?? create();
}

function isStoredMessage(value: unknown): value is PortfolioUIMessage {
  if (!value || typeof value !== 'object') return false;

  const message = value as Partial<PortfolioUIMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
    Array.isArray(message.parts) &&
    message.parts.every(
      (part) => Boolean(part) && typeof part === 'object' && typeof part.type === 'string',
    )
  );
}

export function parseStoredMessages(value: string): PortfolioUIMessage[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isStoredMessage)) return null;
    return parsed;
  } catch {
    return null;
  }
}
