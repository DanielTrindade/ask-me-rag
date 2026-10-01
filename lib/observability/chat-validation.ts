import { estimateTextTokens } from '@/lib/ai/prompt-budget';
import { isPublicChatStatus, type PortfolioUIMessage } from '@/lib/chat-types';
import { isUuid } from '@/lib/uuid';

export const MAX_CHAT_MESSAGES = 50;
export const MAX_MESSAGE_TEXT_LENGTH = 8_000;
export const MAX_MESSAGE_TOKEN_ESTIMATE = 2_500;
export const MAX_CHAT_TEXT_LENGTH = 40_000;
export const MAX_CHAT_BODY_LENGTH = 100_000;

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
      if (estimateTextTokens(part.text) > MAX_MESSAGE_TOKEN_ESTIMATE) {
        throw new ChatValidationError('message_token_budget_exceeded');
      }
      continue;
    }
    if (part.type === 'step-start') {
      continue;
    }
    if (part.type === 'data-chat-status') {
      const data = 'data' in part ? part.data : null;
      if (!isPublicChatStatus(data)) {
        throw new ChatValidationError('invalid_chat_status_part');
      }
      continue;
    }
    throw new ChatValidationError('unsupported_message_part');
  }
}

// The server no longer streams `data-sources` parts (they leaked internal file names and acted
// as a pass/block oracle for the guard), but conversations stored in users' browsers may still
// carry them in assistant history. Drop them instead of rejecting so old conversations keep
// working; the content is never validated, trusted or forwarded.
const LEGACY_DROPPED_PART_TYPES = new Set(['data-sources']);

function stripLegacyParts(message: unknown): unknown {
  if (!message || typeof message !== 'object' || !Array.isArray((message as { parts?: unknown }).parts)) {
    return message;
  }
  const typed = message as { parts: unknown[] };
  return {
    ...typed,
    parts: typed.parts.filter(
      (part) =>
        !(part && typeof part === 'object' &&
          LEGACY_DROPPED_PART_TYPES.has((part as { type?: unknown }).type as string)),
    ),
  };
}

export function getMessageText(message: PortfolioUIMessage) {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

export function parseChatRequestBody(value: unknown) {
  if (!value || typeof value !== 'object') throw new ChatValidationError('invalid_body');
  if (JSON.stringify(value).length > MAX_CHAT_BODY_LENGTH) throw new ChatValidationError('body_too_large');
  const body = value as { conversationId?: unknown; messages?: unknown };
  if (!isUuid(body.conversationId)) {
    throw new ChatValidationError('invalid_conversation_id');
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_CHAT_MESSAGES) {
    throw new ChatValidationError('invalid_messages');
  }
  const messages: unknown[] = body.messages.map(stripLegacyParts);
  messages.forEach(assertMessage);
  const validated = messages as PortfolioUIMessage[];
  // R2-5: o cliente (useChat: sendMessage e regenerate) sempre termina a conversa
  // numa mensagem do usuário. Turno final de assistente só vem de requisição forjada.
  if (validated[validated.length - 1].role !== 'user') {
    throw new ChatValidationError('last_message_not_user');
  }
  const totalText = validated.reduce((sum, message) => sum + getMessageText(message).length, 0);
  if (totalText > MAX_CHAT_TEXT_LENGTH) throw new ChatValidationError('chat_too_large');
  const lastUser = [...validated].reverse().find((message) => message.role === 'user');
  if (!lastUser || getMessageText(lastUser).trim().length === 0) {
    throw new ChatValidationError('missing_user_message');
  }
  return { conversationId: body.conversationId, messages: validated, lastUser };
}

