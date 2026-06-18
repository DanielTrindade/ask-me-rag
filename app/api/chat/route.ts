import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { getModel } from '@/lib/llm';
import { retrieveContext, buildSystemPrompt } from '@/lib/rag';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const queryText =
    lastUser?.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
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
}
