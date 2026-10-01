import 'server-only';

import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import {
  createChatStatusDataPart,
  type PortfolioUIMessage,
  type PublicChatStatus,
} from '@/lib/chat-types';

export function createCachedChatResponse(input: {
  originalMessages: PortfolioUIMessage[];
  responseText: string;
  messageId: string;
  status?: PublicChatStatus;
}) {
  const stream = createUIMessageStream<PortfolioUIMessage>({
    originalMessages: input.originalMessages,
    execute({ writer }) {
      if (input.status) writer.write(createChatStatusDataPart(input.status));
      writer.write({ type: 'text-start', id: input.messageId });
      writer.write({ type: 'text-delta', id: input.messageId, delta: input.responseText });
      writer.write({ type: 'text-end', id: input.messageId });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
