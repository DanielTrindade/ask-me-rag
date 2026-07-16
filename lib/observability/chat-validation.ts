import type { PortfolioUIMessage } from '@/lib/chat-types';

export const MAX_CHAT_MESSAGES = 50;
export const MAX_MESSAGE_TEXT_LENGTH = 8_000;
export const MAX_CHAT_TEXT_LENGTH = 40_000;
export const MAX_CHAT_BODY_LENGTH = 100_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ChatValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ChatValidationError';
  }
}

function assertMessage(value: unknown): asserts value is PortfolioUIMessage {
  if (!value || typeof value !== 'object') throw new ChatValidationError('invalid_message');
  const message = value as Partial<PortfolioUIMessage>;
  if (
    typeof message.id !== 'string' ||
    message.id.length < 1 ||
    message.id.length > 128 ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    !Array.isArray(message.parts)
  ) {
    throw new ChatValidationError('invalid_message');
  }
  for (const part of message.parts) {
    if (!part || typeof part !== 'object' || typeof part.type !== 'string') {
      throw new ChatValidationError('invalid_message_part');
    }
    if (part.type === 'text') {
      if (typeof part.text !== 'string' || part.text.length > MAX_MESSAGE_TEXT_LENGTH) {
        throw new ChatValidationError('message_too_large');
      }
      continue;
    }
    if (part.type === 'data-sources') {
      const data = 'data' in part ? part.data : null;
      const sources =
        data && typeof data === 'object' && 'sources' in data ? data.sources : null;
      if (
        !Array.isArray(sources) ||
        sources.length > 20 ||
        !sources.every(
          (source) =>
            Boolean(source) &&
            typeof source === 'object' &&
            'name' in source &&
            typeof source.name === 'string' &&
            source.name.length > 0 &&
            source.name.length <= 200 &&
            'matchedChunks' in source &&
            typeof source.matchedChunks === 'number' &&
            Number.isInteger(source.matchedChunks) &&
            source.matchedChunks > 0,
        )
      ) {
        throw new ChatValidationError('invalid_sources_part');
      }
      continue;
    }
    throw new ChatValidationError('unsupported_message_part');
  }
}

export function getMessageText(message: PortfolioUIMessage) {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

export function parseChatRequestBody(value: unknown) {
  if (!value || typeof value !== 'object') throw new ChatValidationError('invalid_body');
  if (JSON.stringify(value).length > MAX_CHAT_BODY_LENGTH) throw new ChatValidationError('body_too_large');
  const body = value as { conversationId?: unknown; messages?: unknown };
  if (typeof body.conversationId !== 'string' || !UUID_PATTERN.test(body.conversationId)) {
    throw new ChatValidationError('invalid_conversation_id');
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_CHAT_MESSAGES) {
    throw new ChatValidationError('invalid_messages');
  }
  body.messages.forEach(assertMessage);
  const totalText = body.messages.reduce((sum, message) => sum + getMessageText(message).length, 0);
  if (totalText > MAX_CHAT_TEXT_LENGTH) throw new ChatValidationError('chat_too_large');
  const lastUser = [...body.messages].reverse().find((message) => message.role === 'user');
  if (!lastUser || getMessageText(lastUser).trim().length === 0) {
    throw new ChatValidationError('missing_user_message');
  }
  return { conversationId: body.conversationId, messages: body.messages, lastUser };
}

