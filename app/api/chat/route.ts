import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { createDevelopmentChatResponse } from '@/lib/dev-chat-response';
import { getModel } from '@/lib/llm';
import { retrieveContext, buildSystemPrompt } from '@/lib/rag';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    if (process.env.NODE_ENV === 'development') {
      return createDevelopmentChatResponse();
    }

    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const queryText =
      lastUser?.parts
        ?.flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join(' ') ?? '';

    const context = await retrieveContext(queryText);

    const result = streamText({
      model: getModel(),
      system: buildSystemPrompt(context),
      messages: await convertToModelMessages(messages),
    });

    return createUIMessageStreamResponse({
      stream: result.toUIMessageStream(),
    });
  } catch (error) {
    console.error('[/api/chat] retrieval/stream failed:', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
