import 'server-only';

import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import {
  createChatStatusDataPart,
  createSourcesDataPart,
  type PortfolioUIMessage,
  type PublicChatStatus,
  type SourceReference,
} from '@/lib/chat-types';

export function createCachedChatResponse(input: {
  originalMessages: PortfolioUIMessage[];
  responseText: string;
  sources: SourceReference[];
  messageId: string;
  status?: PublicChatStatus;
}) {
  const stream = createUIMessageStream<PortfolioUIMessage>({
    originalMessages: input.originalMessages,
    execute({ writer }) {
      writer.write(createChatStatusDataPart(input.status ?? {
        kind: 'cache_hit',
        retryable: false,
      }));
      if (input.sources.length > 0) writer.write(createSourcesDataPart(input.sources));
      writer.write({ type: 'text-start', id: input.messageId });
      writer.write({ type: 'text-delta', id: input.messageId, delta: input.responseText });
      writer.write({ type: 'text-end', id: input.messageId });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
