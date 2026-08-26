import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamOptions: null as Record<string, unknown> | null,
  uiOptions: null as Record<string, unknown> | null,
  telemetryEnabled: false,
  beginResult: undefined as string | null | undefined,
  begin: vi.fn(),
  finish: vi.fn(),
  retrieve: vi.fn(),
  streamText: vi.fn(),
  admit: vi.fn(),
  finishGoverned: vi.fn(),
  getCache: vi.fn(),
  putCache: vi.fn(),
  getRevision: vi.fn(),
  cachedResponse: vi.fn(),
  resolveRuntime: vi.fn(),
  classifyScope: vi.fn(),
  config: {
    governance: {
      mode: 'off',
      killSwitch: false,
      visitorPerMinuteLimit: 4,
      visitorDailyLimit: 50,
      globalDailyLimit: 500,
      operationalReserveDaily: 50,
      resetTimeZone: 'America/Los_Angeles',
      conversationLeaseTtlSeconds: 60,
    },
    budget: {
      historyTokens: 4_000,
      ragTokens: 2_000,
      totalInputTokens: 8_000,
      maxOutputTokens: 500,
      ragMaxChunks: 3,
    },
    cache: {
      responseEnabled: false,
      responseTtlSeconds: 86_400,
    },
    rollout: { emergencyBypass: false },
  },
}));

vi.mock('ai', () => ({
  convertToModelMessages: vi.fn(async (messages) => messages),
  wrapLanguageModel: vi.fn(({ model }) => model),
  streamText: vi.fn((options) => {
    mocks.streamOptions = options;
    mocks.streamText(options);
    return { toUIMessageStream: () => new ReadableStream() };
  }),
  createUIMessageStream: vi.fn((options) => {
    mocks.uiOptions = options;
    return new ReadableStream();
  }),
  createUIMessageStreamResponse: vi.fn(() => new Response('stream')),
}));

vi.mock('@/lib/ai/cache', () => ({
  CHAT_PROMPT_REVISION: 'portfolio-chat-v1',
  isSharedResponseCacheEligible: (messages: unknown[]) => messages.length === 1,
  buildResponseCacheKey: () => ({ cacheKey: 'cache-key', questionHash: 'question-hash' }),
  expiresAt: () => '2026-07-19T00:00:00.000Z',
}));

vi.mock('@/lib/ai/cache-store', () => ({
  getKnowledgeRevision: () => mocks.getRevision(),
  getResponseCache: (key: string) => mocks.getCache(key),
  putResponseCache: (input: unknown) => mocks.putCache(input),
}));

vi.mock('@/lib/ai/cached-chat-response', () => ({
  createCachedChatResponse: (input: unknown) => {
    mocks.cachedResponse(input);
    return new Response('static');
  },
}));

vi.mock('@/lib/ai/governance', () => ({
  admitChatRequest: (input: unknown) => mocks.admit(input),
  finishGovernedRequest: (admission: unknown, status: unknown) =>
    mocks.finishGoverned(admission, status),
}));

vi.mock('@/lib/ai/governance-config', () => ({
  parseChatUsageConfig: () => mocks.config,
}));

vi.mock('@/lib/ai/prompt-budget', () => ({
  estimateTextTokens: () => 10,
  buildPromptBudget: ({ messages }: { messages: unknown[] }) => ({
    messages,
    historyTokens: 0,
    requiredTokens: 10,
    estimatedInputTokens: 10,
  }),
}));

vi.mock('@/lib/ai/pricing', () => ({
  estimateGenerationCost: () => ({
    inputCostUsd: 0.000001,
    outputCostUsd: 0.000002,
    totalCostUsd: 0.000003,
    currency: 'USD',
    pricingVersion: '2026-07-17',
  }),
}));

vi.mock('@/lib/dev-chat-response', () => ({
  createDevelopmentChatResponse: vi.fn(() => new Response('development')),
}));

vi.mock('@/lib/llm', () => ({
  resolveChatRuntime: () => mocks.resolveRuntime(),
}));

vi.mock('@/lib/rag', () => ({
  retrieveContext: (query: string, options: unknown) => mocks.retrieve(query, options),
  buildSystemPrompt: () => 'internal-prompt',
}));

vi.mock('@/lib/ai/scope-guard', () => ({
  classifyPortfolioScope: (input: unknown) => mocks.classifyScope(input),
  selectRecentScopeTurns: () => [],
}));

vi.mock('@/lib/observability/config', () => ({
  isChatObservabilityEnabled: () => mocks.telemetryEnabled,
}));

vi.mock('@/lib/observability/device', () => ({
  deriveDeviceInfo: () => ({
    deviceType: 'desktop', isBot: false, osName: 'Windows', osMajor: '11',
    browserName: 'Chrome', browserMajor: '140', preferredLanguage: 'pt-br',
  }),
}));

vi.mock('@/lib/observability/network', () => ({
  getTrustedClientIp: () => '203.0.113.10',
}));

vi.mock('@/lib/observability/ip-crypto', () => ({
  TelemetryCryptoError: class TelemetryCryptoError extends Error { code = 'crypto'; },
  protectIp: () => ({ ipHash: 'hash', ipEncrypted: 'encrypted' }),
  hashIp: () => 'visitor-hash',
}));

vi.mock('@/lib/observability/store', () => ({
  beginChatTelemetry: async (input: unknown) => {
    mocks.begin(input);
    return mocks.beginResult === undefined
      ? (input as { requestId: string }).requestId
      : mocks.beginResult;
  },
  finishChatTelemetry: async (input: unknown) => {
    mocks.finish(input);
    return true;
  },
}));

import { POST } from './route';

const conversationId = '019f5cf7-7cc8-7d02-b252-4920e3c0861b';
const messages = [{
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Projetos?' }],
}];

function request(body: unknown, language = 'pt-BR') {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept-language': language,
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.streamOptions = null;
  mocks.uiOptions = null;
  mocks.telemetryEnabled = false;
  mocks.beginResult = undefined;
  mocks.config.cache.responseEnabled = false;
  mocks.retrieve.mockResolvedValue({
    context: 'context',
    sources: [{ name: 'cv.pdf', matchedChunks: 1 }],
  });
  mocks.classifyScope.mockResolvedValue({ decision: 'in_scope', usage: {} });
  mocks.admit.mockResolvedValue({
    allowed: true,
    decision: 'off',
    shouldFinalize: false,
  });
  mocks.finishGoverned.mockResolvedValue(true);
  mocks.getRevision.mockResolvedValue(1);
  mocks.getCache.mockResolvedValue(null);
  mocks.putCache.mockResolvedValue(undefined);
  mocks.resolveRuntime.mockReturnValue({
    provider: 'groq',
    modelId: 'openai/gpt-oss-20b',
    model: { modelId: 'openai/gpt-oss-20b' },
    providerOptions: undefined,
  });
});

describe('POST /api/chat', () => {
  it('rejeita entrada inválida antes de admissão, RAG ou modelo', async () => {
    const response = await POST(request({ conversationId: 'invalid', messages }) as never);
    expect(response.status).toBe(400);
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('aceita a segunda rodada com a parte step-start emitida pelo AI SDK', async () => {
    const secondTurnMessages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Resuma sua trajetória.' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'text', text: 'Resumo profissional.', state: 'done' },
        ],
      },
      {
        id: 'user-2',
        role: 'user',
        parts: [{ type: 'text', text: 'E os projetos?' }],
      },
    ];

    const response = await POST(request({ conversationId, messages: secondTurnMessages }) as never);

    expect(response.status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledWith('E os projetos?', {
      language: 'pt',
      matchCount: 3,
      tokenBudget: 2_000,
    });
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
  });

  it('responde FAQ pública sem embedding, admissão ou LLM', async () => {
    const faqMessages = [{
      id: 'user-faq',
      role: 'user',
      parts: [{ type: 'text', text: 'Onde encontro seu currículo?' }],
    }];
    const response = await POST(request({ conversationId, messages: faqMessages }) as never);
    expect(response.status).toBe(200);
    expect(mocks.cachedResponse).toHaveBeenCalledWith(expect.objectContaining({
      status: { kind: 'deterministic_fallback', retryable: false },
      sources: [],
    }));
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('serve cache hit antes de reservar consumo', async () => {
    mocks.config.cache.responseEnabled = true;
    mocks.getCache.mockResolvedValue({
      responseText: 'Resposta em cache',
      sources: [{ name: 'cv.pdf', matchedChunks: 1 }],
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
      expiresAt: '2026-07-19T00:00:00Z',
    });
    const response = await POST(request({ conversationId, messages }) as never);
    expect(response.status).toBe(200);
    expect(mocks.cachedResponse).toHaveBeenCalledWith(expect.objectContaining({
      responseText: 'Resposta em cache',
    }));
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it.each([
    ['visitor_limited', 429, 'temporarily_limited'],
    ['global_limited', 429, 'temporarily_limited'],
    ['duplicate', 409, 'conversation_busy'],
    ['conversation_busy', 409, 'conversation_busy'],
    ['disabled', 503, 'disabled'],
    ['governance_unavailable', 503, 'temporarily_unavailable'],
  ] as const)('bloqueia %s sem revelar decisão interna', async (decision, status, publicError) => {
    mocks.admit.mockResolvedValueOnce({
      allowed: false,
      decision,
      shouldFinalize: false,
      resetAt: '2026-07-18T07:00:00Z',
    });
    const response = await POST(request({ conversationId, messages }) as never);
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(body).toMatchObject({ error: publicError });
    expect(body).not.toHaveProperty('decision');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('aplica budgets, modelo resiliente e finaliza telemetria/custo uma vez', async () => {
    mocks.telemetryEnabled = true;
    mocks.admit.mockResolvedValueOnce({
      allowed: true,
      decision: 'allowed',
      reservationRequestId: 'reservation-1',
      shouldFinalize: true,
    });
    const response = await POST(request({ conversationId, messages }) as never);
    expect(response.status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledWith('Projetos?', {
      language: 'pt',
      matchCount: 3,
      tokenBudget: 2_000,
    });
    expect(mocks.streamOptions).toMatchObject({
      system: 'internal-prompt',
      maxOutputTokens: 500,
      maxRetries: 0,
    });

    const streamOptions = mocks.streamOptions as {
      onFinish: (value: unknown) => void;
    };
    streamOptions.onFinish({
      finishReason: 'stop',
      totalUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
    const uiOptions = mocks.uiOptions as {
      onFinish: (value: unknown) => Promise<void>;
    };
    await uiOptions.onFinish({
      responseMessage: {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Resposta' }],
      },
      isAborted: false,
      finishReason: 'stop',
    });

    expect(mocks.finishGoverned).toHaveBeenCalledWith(
      expect.objectContaining({ reservationRequestId: 'reservation-1' }),
      'completed',
    );
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      assistantContent: 'Resposta',
      inputTokens: 10,
      totalTokens: 14,
      governanceDecision: 'allowed',
      providerCalled: true,
      providerAttempts: 2,
      totalCostUsd: 0.000003,
    }));
  });

  it('não chama o modelo quando retrieval falha e mantém logs sanitizados', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.telemetryEnabled = true;
    mocks.retrieve.mockRejectedValueOnce(new Error('private retrieval details Projetos?'));
    const response = await POST(request({ conversationId, messages }) as never);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'temporarily_unavailable',
      retryable: false,
    });
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorCategory: 'retrieval_failed',
      providerCalled: false,
    }));
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('private retrieval details');
    expect(logged).not.toContain('Projetos?');
  });

  it('grava cache somente após resposta completa elegível', async () => {
    mocks.config.cache.responseEnabled = true;
    await POST(request({ conversationId, messages }) as never);
    const uiOptions = mocks.uiOptions as {
      onFinish: (value: unknown) => Promise<void>;
    };
    await uiOptions.onFinish({
      responseMessage: {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Resposta completa' }],
      },
      isAborted: false,
      finishReason: 'stop',
    });
    expect(mocks.putCache).toHaveBeenCalledWith(expect.objectContaining({
      cacheKey: 'cache-key',
      questionHash: 'question-hash',
      responseText: 'Resposta completa',
    }));
  });

  it.each([
    'Quanto é 2 - 2?',
    'Qual o algoritmo de Dijkstra?',
  ])('recusa sem modelo quando não existe evidência: %s', async (question) => {
    mocks.retrieve.mockResolvedValueOnce({ context: '', sources: [] });
    const response = await POST(request({
      conversationId,
      messages: [{ id: 'off-topic', role: 'user', parts: [{ type: 'text', text: question }] }],
    }) as never);

    expect(response.status).toBe(200);
    expect(mocks.classifyScope).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.cachedResponse).toHaveBeenCalledWith(expect.objectContaining({
      responseText: expect.stringContaining('fontes profissionais'),
      sources: [],
      status: { kind: 'deterministic_fallback', retryable: false },
    }));
  });

  it('recusa pergunta genérica mesmo quando o FTS encontra um trecho acidental', async () => {
    mocks.retrieve.mockResolvedValueOnce({
      context: 'Daniel estudou estruturas de dados.',
      sources: [{ name: 'cv.pdf', matchedChunks: 1 }],
    });
    mocks.classifyScope.mockResolvedValueOnce({
      decision: 'out_of_scope',
      usage: { inputTokens: 20, outputTokens: 2, totalTokens: 22 },
    });

    await POST(request({
      conversationId,
      messages: [{ id: 'dijkstra', role: 'user', parts: [{
        type: 'text', text: 'Explique o algoritmo de Dijkstra.',
      }] }],
    }) as never);

    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.cachedResponse).toHaveBeenCalledWith(expect.objectContaining({
      responseText: expect.stringContaining('trajetória profissional'),
      sources: [],
    }));
  });

  it('gera somente quando há fonte e o escopo foi aprovado', async () => {
    mocks.retrieve.mockResolvedValueOnce({
      context: 'Daniel utilizou TypeScript no projeto ACME.',
      sources: [{ name: 'projetos.md', matchedChunks: 1 }],
    });
    mocks.classifyScope.mockResolvedValueOnce({
      decision: 'in_scope',
      usage: { inputTokens: 18, outputTokens: 2, totalTokens: 20 },
    });

    await POST(request({
      conversationId,
      messages: [{ id: 'typescript', role: 'user', parts: [{
        type: 'text', text: 'Como você usou TypeScript profissionalmente?',
      }] }],
    }) as never);

    expect(mocks.classifyScope).toHaveBeenCalledTimes(1);
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
  });

  it('falha fechado quando o classificador não responde', async () => {
    mocks.classifyScope.mockRejectedValueOnce(new Error('private classifier response'));
    const response = await POST(request({ conversationId, messages }) as never);
    expect(response.status).toBe(503);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
});
