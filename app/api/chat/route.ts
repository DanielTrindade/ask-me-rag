import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  wrapLanguageModel,
} from 'ai';
import type { NextRequest } from 'next/server';
import {
  buildResponseCacheKey,
  CHAT_PROMPT_REVISION,
  expiresAt,
  isSharedResponseCacheEligible,
} from '@/lib/ai/cache';
import {
  getKnowledgeRevision,
  getResponseCache,
  putResponseCache,
} from '@/lib/ai/cache-store';
import { createCachedChatResponse } from '@/lib/ai/cached-chat-response';
import {
  admitChatRequest,
  finishGovernedRequest,
  type ChatAdmissionResult,
} from '@/lib/ai/governance';
import { parseChatUsageConfig } from '@/lib/ai/governance-config';
import { verifyGroundedness } from '@/lib/ai/groundedness';
import { inspectForPromptInjection } from '@/lib/ai/injection-guard';
import { portfolioRefusal, hasGroundedPortfolioContext } from '@/lib/ai/portfolio-policy';
import { buildPromptBudget } from '@/lib/ai/prompt-budget';
import { estimateGenerationCost } from '@/lib/ai/pricing';
import { resolveQuestionLocale } from '@/lib/ai/question-locale';
import { classifyPortfolioScope, selectRecentScopeTurns, type ScopeGuardResult } from '@/lib/ai/scope-guard';
import {
  classifyGenerationError,
  createPreStreamRetryMiddleware,
  degradedChatResponse,
  logGenerationFailure,
  resolveChatLocale,
} from '@/lib/ai/resilience';
import {
  createSourcesDataPart,
  serializePublicChatStatus,
  type PortfolioUIMessage,
} from '@/lib/chat-types';
import { createDevelopmentChatResponse } from '@/lib/dev-chat-response';
import { findDeterministicFaqAnswer } from '@/lib/deterministic-faq';
import { resolveChatRuntime } from '@/lib/llm';
import {
  ChatValidationError,
  MAX_CHAT_BODY_LENGTH,
  getMessageText,
  parseChatRequestBody,
} from '@/lib/observability/chat-validation';
import { isChatObservabilityEnabled } from '@/lib/observability/config';
import { deriveDeviceInfo } from '@/lib/observability/device';
import { hashIp, protectIp, TelemetryCryptoError } from '@/lib/observability/ip-crypto';
import { getTrustedClientIp } from '@/lib/observability/network';
import {
  beginChatTelemetry,
  finishChatTelemetry,
  type FinishChatTelemetryInput,
} from '@/lib/observability/store';
import { buildSystemPrompt, retrieveContext } from '@/lib/rag';

export const maxDuration = 30;

// providerAttempts/providerCalled vêm sempre do estado da requisição em
// finalizeExecution; excluí-los aqui impede um chamador de passá-los em vão.
type TerminalInput = Omit<
  FinishChatTelemetryInput,
  'requestId' | 'durationMs' | 'providerAttempts' | 'providerCalled'
>;

function addOptionalTokens(left?: number, right?: number) {
  return left === undefined && right === undefined
    ? undefined
    : (left ?? 0) + (right ?? 0);
}

function validationResponse(error: ChatValidationError) {
  const status = error.code === 'body_too_large' ? 413 : 400;
  return Response.json({ error: 'invalid_request', category: error.code }, { status });
}

function admissionResponse(admission: ChatAdmissionResult, locale: 'pt' | 'en') {
  const headers = { 'cache-control': 'no-store' };
  if (admission.decision === 'visitor_limited' || admission.decision === 'global_limited') {
    return Response.json(
      {
        ...degradedChatResponse('temporarily_limited', locale),
        resetAt: admission.resetAt,
      },
      { status: 429, headers },
    );
  }
  if (admission.decision === 'duplicate' || admission.decision === 'conversation_busy') {
    return Response.json(
      {
        ...degradedChatResponse('conversation_busy', locale),
        resetAt: admission.resetAt,
      },
      { status: 409, headers },
    );
  }
  if (admission.decision === 'disabled') {
    return Response.json(degradedChatResponse('disabled', locale), { status: 503, headers });
  }
  return Response.json(
    degradedChatResponse('temporarily_unavailable', locale),
    { status: 503, headers },
  );
}

async function recordImmediateTelemetry(input: {
  req: NextRequest;
  requestId: string;
  conversationId: string;
  userMessageId: string;
  userContent: string;
  status: 'completed' | 'failed';
  governanceDecision: FinishChatTelemetryInput['governanceDecision'];
  cacheStatus: FinishChatTelemetryInput['cacheStatus'];
  provider?: string;
  model?: string;
  assistantContent?: string;
  sources?: FinishChatTelemetryInput['sources'];
}) {
  if (!isChatObservabilityEnabled()) return;
  let protectedIp = { ipHash: null as string | null, ipEncrypted: null as string | null };
  try {
    protectedIp = protectIp(getTrustedClientIp(input.req));
  } catch (error) {
    const category = error instanceof TelemetryCryptoError ? error.code : 'ip_protection_failed';
    console.warn('[chat-observability] ip_protection_failed', { category });
  }
  const telemetryId = await beginChatTelemetry({
    requestId: input.requestId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    userContent: input.userContent,
    ...protectedIp,
    ...deriveDeviceInfo(input.req),
    traceId: input.requestId,
  });
  if (!telemetryId) return;
  await finishChatTelemetry({
    requestId: telemetryId,
    status: input.status,
    assistantMessageId: input.assistantContent ? input.requestId : undefined,
    assistantContent: input.assistantContent,
    messageStatus: input.assistantContent ? 'complete' : undefined,
    sources: input.sources,
    durationMs: 0,
    provider: input.provider,
    model: input.model,
    governanceDecision: input.governanceDecision,
    cacheStatus: input.cacheStatus,
    providerAttempts: 0,
    providerCalled: false,
  });
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
  const interfaceLocale = resolveChatLocale(req.headers.get('accept-language'));
  let parsed: ReturnType<typeof parseChatRequestBody>;
  try {
    parsed = parseChatRequestBody(await readRequestBody(req));
  } catch (error) {
    if (error instanceof ChatValidationError) return validationResponse(error);
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const { conversationId, messages, lastUser } = parsed;
  const proposedRequestId = crypto.randomUUID();
  const userQuestion = getMessageText(lastUser);
  const locale = resolveQuestionLocale(userQuestion, interfaceLocale);
  const deterministicAnswer = findDeterministicFaqAnswer(userQuestion, locale);
  if (deterministicAnswer) {
    await recordImmediateTelemetry({
      req,
      requestId: proposedRequestId,
      conversationId,
      userMessageId: lastUser.id,
      userContent: userQuestion,
      status: 'completed',
      governanceDecision: 'off',
      cacheStatus: 'ineligible',
      assistantContent: deterministicAnswer,
    });
    return createCachedChatResponse({
      originalMessages: messages,
      responseText: deterministicAnswer,
      sources: [],
      messageId: proposedRequestId,
    });
  }

  let usageConfig: ReturnType<typeof parseChatUsageConfig>;
  try {
    usageConfig = parseChatUsageConfig();
  } catch {
    console.error('[chat-governance] usage_configuration_failed');
    return Response.json(
      degradedChatResponse('temporarily_unavailable', locale),
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  let resolvedRuntime: ReturnType<typeof resolveChatRuntime> | undefined;
  let requestCacheStatus: FinishChatTelemetryInput['cacheStatus'] = 'ineligible';
  let responseCacheContext: {
    cacheKey: string;
    questionHash: string;
    knowledgeRevision: number;
    provider: string;
    model: string;
  } | null = null;

  if (usageConfig.cache.responseEnabled && isSharedResponseCacheEligible(messages)) {
    requestCacheStatus = 'miss';
    try {
      resolvedRuntime = resolveChatRuntime();
      const knowledgeRevision = await getKnowledgeRevision();
      const identity = buildResponseCacheKey({
        question: userQuestion,
        locale,
        provider: resolvedRuntime.provider,
        model: resolvedRuntime.modelId,
        promptRevision: CHAT_PROMPT_REVISION,
        knowledgeRevision,
      });
      responseCacheContext = {
        ...identity,
        knowledgeRevision,
        provider: resolvedRuntime.provider,
        model: resolvedRuntime.modelId,
      };
      const cached = await getResponseCache(identity.cacheKey);
      if (cached) {
        await recordImmediateTelemetry({
          req,
          requestId: proposedRequestId,
          conversationId,
          userMessageId: lastUser.id,
          userContent: userQuestion,
          status: 'completed',
          governanceDecision: 'off',
          cacheStatus: 'hit',
          provider: cached.provider,
          model: cached.model,
          assistantContent: cached.responseText,
          sources: cached.sources,
        });
        return createCachedChatResponse({
          originalMessages: messages,
          responseText: cached.responseText,
          sources: cached.sources,
          messageId: proposedRequestId,
          status: { kind: 'cache_hit', retryable: false },
        });
      }
    } catch {
      requestCacheStatus = 'bypass';
      console.warn('[response-cache] read_failed', { category: 'store_unavailable' });
    }
  }

  if (usageConfig.injectionGuard.enabled) {
    const injection = inspectForPromptInjection(userQuestion);
    if (injection.decision === 'blocked') {
      const responseText = portfolioRefusal(locale, 'out_of_scope');
      await recordImmediateTelemetry({
        req,
        requestId: proposedRequestId,
        conversationId,
        userMessageId: lastUser.id,
        userContent: userQuestion,
        status: 'completed',
        governanceDecision: 'off',
        cacheStatus: requestCacheStatus,
        assistantContent: responseText,
      });
      return createCachedChatResponse({
        originalMessages: messages,
        responseText,
        sources: [],
        messageId: proposedRequestId,
      });
    }
  }

  let visitorKey: string | null = null;
  try {
    const clientIp = getTrustedClientIp(req);
    if (clientIp !== 'unknown') visitorKey = hashIp(clientIp);
  } catch (error) {
    const category = error instanceof TelemetryCryptoError ? error.code : 'ip_hash_failed';
    console.warn('[chat-governance] visitor_identity_unavailable', { category });
  }

  let admission: ChatAdmissionResult;
  try {
    admission = await admitChatRequest({
      requestId: proposedRequestId,
      conversationId,
      messageId: lastUser.id,
      visitorKey,
    });
  } catch {
    console.error('[chat-governance] admission_configuration_failed');
    admission = {
      allowed: false,
      decision: 'governance_unavailable',
      shouldFinalize: false,
    };
  }

  if (!admission.allowed) {
    await recordImmediateTelemetry({
      req,
      requestId: proposedRequestId,
      conversationId,
      userMessageId: lastUser.id,
      userContent: userQuestion,
      status: 'failed',
      governanceDecision: admission.observedDecision ?? admission.decision,
      cacheStatus: requestCacheStatus,
    });
    return admissionResponse(admission, locale);
  }

  const startedAt = performance.now();
  let telemetryRequestId: string | null = null;
  let finalized = false;
  let providerAttempts = 0;
  let providerCalled = false;
  let classifierUsage: ScopeGuardResult['usage'] | undefined;

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

    telemetryRequestId = await beginChatTelemetry({
      requestId: proposedRequestId,
      conversationId,
      userMessageId: lastUser.id,
      userContent: userQuestion,
      ...protectedIp,
      ...deriveDeviceInfo(req),
      traceId: proposedRequestId,
    });
  }

  async function finalizeExecution(input: TerminalInput) {
    if (finalized) return;
    finalized = true;
    const governanceStatus =
      input.status === 'completed'
        ? 'completed'
        : input.errorCategory === 'timeout'
          ? 'timed_out'
          : input.status;
    await finishGovernedRequest(admission, governanceStatus);
    if (!telemetryRequestId) return;
    await finishChatTelemetry({
      ...input,
      requestId: telemetryRequestId,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      governanceDecision: admission.observedDecision ?? admission.decision,
      cacheStatus: requestCacheStatus,
      providerAttempts,
      providerCalled,
    });
  }

  function classifierTelemetry(provider?: string, model?: string) {
    if (!classifierUsage) return {};
    const costs = provider && model
      ? estimateGenerationCost({
          provider,
          model,
          inputTokens: classifierUsage.inputTokens,
          outputTokens: classifierUsage.outputTokens,
        })
      : {};
    return {
      inputTokens: classifierUsage.inputTokens,
      outputTokens: classifierUsage.outputTokens,
      totalTokens: classifierUsage.totalTokens,
      ...costs,
    };
  }

  try {
    if (process.env.NODE_ENV === 'development') {
      return createDevelopmentChatResponse({
        originalMessages: messages,
        onFinish: async ({ responseMessage, isAborted, finishReason }) => {
          await finalizeExecution({
            status: isAborted ? 'aborted' : 'completed',
            assistantMessageId: responseMessage.id,
            assistantContent: getMessageText(responseMessage),
            messageStatus: isAborted ? 'partial' : 'complete',
            provider: 'development',
            model: 'local-preview',
            finishReason,
          });
        },
      });
    }

    let retrieval: Awaited<ReturnType<typeof retrieveContext>>;
    try {
      retrieval = await retrieveContext(userQuestion, {
        language: locale,
        matchCount: usageConfig.budget.ragMaxChunks,
        tokenBudget: usageConfig.budget.ragTokens,
      });
    } catch (error) {
      const failure = classifyGenerationError(error, 'retrieval');
      logGenerationFailure({
        requestId: proposedRequestId,
        status: 'failed',
        category: failure.category,
        retryable: failure.retryable,
        attempt: 1,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
      await finalizeExecution({
        status: 'failed',
        errorCategory: failure.category,
        retryable: failure.retryable,
      });
      return Response.json(
        {
          ...degradedChatResponse('temporarily_unavailable', locale),
          retryable: failure.retryable,
        },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    if (!hasGroundedPortfolioContext(retrieval)) {
      const responseText = portfolioRefusal(locale, 'missing_evidence');
      await finalizeExecution({
        status: 'completed',
        assistantMessageId: proposedRequestId,
        assistantContent: responseText,
        messageStatus: 'complete',
        sources: [],
      });
      return createCachedChatResponse({
        originalMessages: messages,
        responseText,
        sources: [],
        messageId: proposedRequestId,
      });
    }

    if (!resolvedRuntime) resolvedRuntime = resolveChatRuntime();
    const runtime = resolvedRuntime;
    const provider = runtime.provider;
    const model = runtime.modelId;
    let modelOutcome:
      | {
          finishReason: string;
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        }
      | undefined;
    let groundednessUsage:
      | {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        }
      | undefined;
    providerCalled = true;
    providerAttempts = 1;
    try {
      const scope = await classifyPortfolioScope({
        question: userQuestion,
        recentTurns: selectRecentScopeTurns(messages, lastUser.id),
        runtime,
      });
      classifierUsage = scope.usage;

      if (scope.decision === 'out_of_scope') {
        const responseText = portfolioRefusal(locale, 'out_of_scope');
        const costs = estimateGenerationCost({
          provider: runtime.provider,
          model: runtime.modelId,
          inputTokens: classifierUsage.inputTokens,
          outputTokens: classifierUsage.outputTokens,
        });
        await finalizeExecution({
          status: 'completed',
          assistantMessageId: proposedRequestId,
          assistantContent: responseText,
          messageStatus: 'complete',
          provider: runtime.provider,
          model: runtime.modelId,
          inputTokens: classifierUsage.inputTokens,
          outputTokens: classifierUsage.outputTokens,
          totalTokens: classifierUsage.totalTokens,
          ...costs,
        });
        return createCachedChatResponse({
          originalMessages: messages,
          responseText,
          sources: [],
          messageId: proposedRequestId,
        });
      }
    } catch (error) {
      const failure = classifyGenerationError(error);
      logGenerationFailure({
        requestId: proposedRequestId,
        provider,
        model,
        status: 'failed',
        category: failure.category,
        retryable: failure.retryable,
        attempt: 1,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
      await finalizeExecution({
        status: 'failed',
        errorCategory: failure.category,
        retryable: failure.retryable,
      });
      return Response.json(
        {
          ...degradedChatResponse('temporarily_unavailable', locale),
          retryable: failure.retryable,
        },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    const retryMiddleware = createPreStreamRetryMiddleware({
      maxRetries: 2,
      onRetry({ attempt, failure }) {
        providerAttempts += 1;
        logGenerationFailure({
          requestId: proposedRequestId,
          provider,
          model,
          status: 'retrying',
          category: failure.category,
          retryable: failure.retryable,
          attempt,
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        });
      },
    });
    const systemPrompt = buildSystemPrompt(retrieval.context, locale);
    const prompt = buildPromptBudget({
      systemPrompt,
      messages,
      currentMessageId: lastUser.id,
      historyTokenBudget: usageConfig.budget.historyTokens,
      totalInputTokenBudget: usageConfig.budget.totalInputTokens,
    });

    let responseText: string;
    let grounded = true;
    providerAttempts += 1;
    try {
      const generated = await generateText({
        model: wrapLanguageModel({ model: runtime.model, middleware: retryMiddleware }),
        system: systemPrompt,
        messages: await convertToModelMessages(prompt.messages),
        providerOptions: runtime.providerOptions,
        maxOutputTokens: usageConfig.budget.maxOutputTokens,
        maxRetries: 0,
        temperature: 0,
      });
      modelOutcome = {
        finishReason: generated.finishReason,
        inputTokens: generated.totalUsage.inputTokens,
        outputTokens: generated.totalUsage.outputTokens,
        totalTokens: generated.totalUsage.totalTokens,
      };

      const candidate = generated.text.trim();
      if (candidate && usageConfig.groundedness.enabled) {
        providerAttempts += 1;
        try {
          const verification = await verifyGroundedness({
            question: userQuestion,
            context: retrieval.context,
            answer: candidate,
            runtime,
          });
          groundednessUsage = verification.usage;
          grounded = verification.decision === 'grounded';
        } catch (error) {
          const failure = classifyGenerationError(error);
          logGenerationFailure({
            requestId: proposedRequestId,
            provider,
            model,
            status: 'failed',
            category: failure.category,
            retryable: false,
            attempt: providerAttempts,
            durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          });
          grounded = false;
        }
      }
      responseText = grounded
        ? candidate
        : portfolioRefusal(locale, 'missing_evidence');
    } catch (error) {
      const failure = classifyGenerationError(error);
      logGenerationFailure({
        requestId: proposedRequestId,
        provider,
        model,
        status: failure.category === 'aborted' ? 'aborted' : 'failed',
        category: failure.category,
        retryable: failure.retryable,
        attempt: providerAttempts,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
      await finalizeExecution({
        status: failure.category === 'aborted' ? 'aborted' : 'failed',
        provider,
        model,
        errorCategory: failure.category,
        retryable: failure.retryable,
        ...classifierTelemetry(provider, model),
      });
      return Response.json(
        {
          ...degradedChatResponse('temporarily_unavailable', locale),
          retryable: failure.retryable,
        },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    const inputTokens = addOptionalTokens(
      addOptionalTokens(classifierUsage?.inputTokens, modelOutcome?.inputTokens),
      groundednessUsage?.inputTokens,
    );
    const outputTokens = addOptionalTokens(
      addOptionalTokens(classifierUsage?.outputTokens, modelOutcome?.outputTokens),
      groundednessUsage?.outputTokens,
    );
    const totalTokens = addOptionalTokens(
      addOptionalTokens(classifierUsage?.totalTokens, modelOutcome?.totalTokens),
      groundednessUsage?.totalTokens,
    );
    const costs = estimateGenerationCost({
      provider,
      model,
      inputTokens,
      outputTokens,
    });

    const stream = createUIMessageStream<PortfolioUIMessage>({
      originalMessages: messages,
      execute({ writer }) {
        if (grounded && retrieval.sources.length > 0) {
          writer.write(createSourcesDataPart(retrieval.sources));
        }
        writer.write({ type: 'text-start', id: proposedRequestId });
        writer.write({ type: 'text-delta', id: proposedRequestId, delta: responseText });
        writer.write({ type: 'text-end', id: proposedRequestId });
      },
      async onFinish({ responseMessage, isAborted, finishReason }) {
        const aborted = isAborted;
        const finalText = getMessageText(responseMessage);

        if (!aborted && grounded && responseCacheContext && finalText.trim()) {
          try {
            await putResponseCache({
              ...responseCacheContext,
              locale,
              promptRevision: CHAT_PROMPT_REVISION,
              responseText: finalText,
              sources: retrieval.sources,
              expiresAt: expiresAt(usageConfig.cache.responseTtlSeconds),
            });
          } catch {
            console.warn('[response-cache] write_failed', { category: 'store_unavailable' });
          }
        }

        await finalizeExecution({
          status: aborted ? 'aborted' : 'completed',
          assistantMessageId: responseMessage.id,
          assistantContent: finalText,
          messageStatus: aborted ? 'partial' : 'complete',
          provider,
          model,
          finishReason: modelOutcome?.finishReason ?? finishReason,
          inputTokens,
          outputTokens,
          totalTokens,
          sources: grounded ? retrieval.sources : [],
          inputCostUsd: costs.inputCostUsd,
          outputCostUsd: costs.outputCostUsd,
          totalCostUsd: costs.totalCostUsd,
          costCurrency: costs.currency,
          pricingVersion: costs.pricingVersion,
        });
      },
      onError(error) {
        const failure = classifyGenerationError(error);
        void finalizeExecution({
          status: failure.category === 'aborted' ? 'aborted' : 'failed',
          provider,
          model,
          errorCategory: failure.category,
          retryable: failure.retryable,
          ...classifierTelemetry(provider, model),
        });
        return serializePublicChatStatus({
          kind: 'temporarily_unavailable',
          retryable: failure.retryable,
        });
      },
    });

    return createUIMessageStreamResponse({
      stream,
      consumeSseStream: ({ stream: copy }) => copy.pipeTo(new WritableStream()),
    });
  } catch (error) {
    const failure = classifyGenerationError(error);
    await finalizeExecution({
      status: failure.category === 'aborted' ? 'aborted' : 'failed',
      errorCategory: failure.category,
      retryable: failure.retryable,
      ...(resolvedRuntime
        ? classifierTelemetry(resolvedRuntime.provider, resolvedRuntime.modelId)
        : classifierTelemetry()),
    });
    logGenerationFailure({
      requestId: proposedRequestId,
      status: failure.category === 'aborted' ? 'aborted' : 'failed',
      category: failure.category,
      retryable: failure.retryable,
      attempt: Math.max(1, providerAttempts),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    return Response.json(
      {
        ...degradedChatResponse('temporarily_unavailable', locale),
        retryable: failure.retryable,
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
