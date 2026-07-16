import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';
import type { NextRequest } from 'next/server';
import {
  getMessageSources,
  createSourcesDataPart,
  type PortfolioUIMessage,
} from '@/lib/chat-types';
import { createDevelopmentChatResponse } from '@/lib/dev-chat-response';
import { getChatProviderOptions, getModel, getModelName, getProvider } from '@/lib/llm';
import {
  ChatValidationError,
  MAX_CHAT_BODY_LENGTH,
  getMessageText,
  parseChatRequestBody,
} from '@/lib/observability/chat-validation';
import { isChatObservabilityEnabled } from '@/lib/observability/config';
import { deriveDeviceInfo } from '@/lib/observability/device';
import { protectIp, TelemetryCryptoError } from '@/lib/observability/ip-crypto';
import { getTrustedClientIp } from '@/lib/observability/network';
import {
  beginChatTelemetry,
  finishChatTelemetry,
  type FinishChatTelemetryInput,
} from '@/lib/observability/store';
import { buildSystemPrompt, retrieveContext } from '@/lib/rag';

export const maxDuration = 30;

type TerminalInput = Omit<FinishChatTelemetryInput, 'requestId' | 'durationMs'>;

function validationResponse(error: ChatValidationError) {
  const status = error.code === 'body_too_large' ? 413 : 400;
  return Response.json({ error: 'invalid_request', category: error.code }, { status });
}

async function readRequestBody(req: NextRequest) {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CHAT_BODY_LENGTH) {
    throw new ChatValidationError('body_too_large');
  }

  const raw = await req.text();
  if (raw.length > MAX_CHAT_BODY_LENGTH) {
    throw new ChatValidationError('body_too_large');
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ChatValidationError('invalid_json');
  }
}

export async function POST(req: NextRequest) {
  let parsed: ReturnType<typeof parseChatRequestBody>;
  try {
    parsed = parseChatRequestBody(await readRequestBody(req));
  } catch (error) {
    if (error instanceof ChatValidationError) return validationResponse(error);
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const { conversationId, messages, lastUser } = parsed;
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  let telemetryStarted = false;
  let finalized = false;

  if (isChatObservabilityEnabled()) {
    let protectedIp: { ipHash: string | null; ipEncrypted: string | null } = {
      ipHash: null,
      ipEncrypted: null,
    };
    try {
      protectedIp = protectIp(getTrustedClientIp(req));
    } catch (error) {
      const category =
        error instanceof TelemetryCryptoError ? error.code : 'ip_protection_failed';
      console.warn('[chat-observability] ip_protection_failed', { category });
    }

    const device = deriveDeviceInfo(req);
    telemetryStarted = await beginChatTelemetry({
      requestId,
      conversationId,
      userMessageId: lastUser.id,
      userContent: getMessageText(lastUser),
      ...protectedIp,
      ...device,
      traceId: requestId,
    });
  }

  async function finalizeTelemetry(input: TerminalInput) {
    if (!telemetryStarted || finalized) return;
    finalized = true;
    await finishChatTelemetry({
      ...input,
      requestId,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
  }

  try {
    if (process.env.NODE_ENV === 'development') {
      return createDevelopmentChatResponse({
        originalMessages: messages,
        onFinish: async ({ responseMessage, isAborted, finishReason }) => {
          await finalizeTelemetry({
            status: isAborted ? 'aborted' : 'completed',
            assistantMessageId: responseMessage.id,
            assistantContent: getMessageText(responseMessage),
            messageStatus: isAborted ? 'partial' : 'complete',
            sources: getMessageSources(responseMessage),
            provider: 'development',
            model: 'local-preview',
            finishReason,
          });
        },
      });
    }

    const retrieval = await retrieveContext(getMessageText(lastUser));
    const provider = getProvider();
    const model = getModelName(provider);
    let modelOutcome:
      | {
          finishReason: string;
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        }
      | undefined;
    let modelAborted = false;

    const result = streamText({
      model: getModel(provider),
      system: buildSystemPrompt(retrieval.context),
      messages: await convertToModelMessages(messages),
      providerOptions: getChatProviderOptions(provider),
      onFinish({ finishReason, totalUsage }) {
        modelOutcome = {
          finishReason,
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
        };
      },
      onAbort() {
        modelAborted = true;
      },
      async onError() {
        await finalizeTelemetry({
          status: 'failed',
          provider,
          model,
          errorCategory: 'model_stream_failed',
        });
      },
    });

    const stream = createUIMessageStream<PortfolioUIMessage>({
      originalMessages: messages,
      execute({ writer }) {
        writer.write(createSourcesDataPart(retrieval.sources));
        writer.merge(result.toUIMessageStream());
      },
      async onFinish({ responseMessage, isAborted, finishReason }) {
        const aborted = isAborted || modelAborted;
        await finalizeTelemetry({
          status: aborted ? 'aborted' : 'completed',
          assistantMessageId: responseMessage.id,
          assistantContent: getMessageText(responseMessage),
          messageStatus: aborted ? 'partial' : 'complete',
          sources: getMessageSources(responseMessage),
          provider,
          model,
          finishReason: modelOutcome?.finishReason ?? finishReason,
          inputTokens: modelOutcome?.inputTokens,
          outputTokens: modelOutcome?.outputTokens,
          totalTokens: modelOutcome?.totalTokens,
        });
      },
      onError() {
        void finalizeTelemetry({
          status: 'failed',
          provider,
          model,
          errorCategory: 'ui_stream_failed',
        });
        return 'Não foi possível concluir a resposta.';
      },
    });

    return createUIMessageStreamResponse({
      stream,
      consumeSseStream: ({ stream: copy }) => copy.pipeTo(new WritableStream()),
    });
  } catch {
    await finalizeTelemetry({
      status: 'failed',
      errorCategory: 'request_processing_failed',
    });
    console.error('[/api/chat] request_processing_failed');
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
