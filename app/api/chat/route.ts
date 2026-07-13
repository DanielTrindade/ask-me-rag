import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import type { PortfolioUIMessage } from '@/lib/chat-types';
import { createDevelopmentChatResponse } from '@/lib/dev-chat-response';
import { getChatProviderOptions, getModel } from '@/lib/llm';
import { retrieveContext, buildSystemPrompt } from '@/lib/rag';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: PortfolioUIMessage[] } = await req.json();

    if (process.env.NODE_ENV === 'development') {
      return createDevelopmentChatResponse();
    }

    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const queryText =
      lastUser?.parts
        ?.flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join(' ') ?? '';

    const retrieval = await retrieveContext(queryText);

    const result = streamText({
      model: getModel(),
      system: buildSystemPrompt(retrieval.context),
      messages: await convertToModelMessages(messages),
      providerOptions: getChatProviderOptions(),
    });

    const stream = createUIMessageStream<PortfolioUIMessage>({
      execute({ writer }) {
        writer.write({
          type: 'data-sources',
          id: 'retrieval-sources',
          data: { sources: retrieval.sources },
        });
        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('[/api/chat] retrieval/stream failed:', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
