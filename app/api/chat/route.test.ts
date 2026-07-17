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
}));

vi.mock('ai', () => ({
  convertToModelMessages: vi.fn(async (messages) => messages),
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

vi.mock('@/lib/dev-chat-response', () => ({
  createDevelopmentChatResponse: vi.fn(() => new Response('development')),
}));

vi.mock('@/lib/llm', () => ({
  getProvider: () => 'google',
  getModelName: () => 'test-model',
  getModel: () => ({ modelId: 'test-model' }),
  getChatProviderOptions: () => undefined,
}));

vi.mock('@/lib/rag', () => ({
  retrieveContext: (query: string) => mocks.retrieve(query),
  buildSystemPrompt: () => 'internal-prompt',
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

vi.mock('@/lib/observability/network', () => ({ getTrustedClientIp: () => '203.0.113.10' }));
vi.mock('@/lib/observability/ip-crypto', () => ({
  TelemetryCryptoError: class TelemetryCryptoError extends Error { code = 'crypto'; },
  protectIp: () => ({ ipHash: 'hash', ipEncrypted: 'encrypted' }),
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

const conversationId = '019f5cf7-0cc8-7d02-b252-4920e3c0861b';
const messages = [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Projetos?' }] }];

function request(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.streamOptions = null;
  mocks.uiOptions = null;
  mocks.telemetryEnabled = false;
  mocks.beginResult = undefined;
  mocks.retrieve.mockResolvedValue({ context: 'context', sources: [] });
});

describe('POST /api/chat observability', () => {
  it('rejects invalid input before retrieval or model execution', async () => {
    const response = await POST(request({ conversationId: 'invalid', messages }) as never);
    expect(response.status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('keeps observability disabled behind the feature flag', async () => {
    const response = await POST(request({ conversationId, messages }) as never);
    expect(response.status).toBe(200);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('captures only the new user turn and completes through one finalizer', async () => {
    mocks.telemetryEnabled = true;
    const response = await POST(request({ conversationId, messages }) as never);
    expect(response.status).toBe(200);
    expect(mocks.begin).toHaveBeenCalledWith(expect.objectContaining({
      conversationId,
      userMessageId: 'user-1',
      userContent: 'Projetos?',
      ipHash: 'hash',
      browserName: 'Chrome',
    }));

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
      responseMessage: { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Resposta' }] },
      isAborted: false,
      finishReason: 'stop',
    });

    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      assistantContent: 'Resposta',
      inputTokens: 10,
      totalTokens: 14,
    }));
  });

  it('persists cancellation as a partial response', async () => {
    mocks.telemetryEnabled = true;
    await POST(request({ conversationId, messages }) as never);
    const streamOptions = mocks.streamOptions as { onAbort: () => void };
    streamOptions.onAbort();
    const uiOptions = mocks.uiOptions as { onFinish: (value: unknown) => Promise<void> };
    await uiOptions.onFinish({
      responseMessage: { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Parcial' }] },
      isAborted: false,
    });
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
      status: 'aborted', messageStatus: 'partial', assistantContent: 'Parcial',
    }));
  });

  it('uses the canonical persisted request id for repeated submissions', async () => {
    mocks.telemetryEnabled = true;
    const canonicalRequestId = 'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6';
    mocks.beginResult = canonicalRequestId;
    await POST(request({ conversationId, messages }) as never);
    const firstRequestId = mocks.begin.mock.calls[0][0].requestId;
    await POST(request({ conversationId, messages }) as never);
    const secondRequestId = mocks.begin.mock.calls[1][0].requestId;
    expect(firstRequestId).not.toBe(secondRequestId);

    const uiOptions = mocks.uiOptions as {
      onFinish: (value: unknown) => Promise<void>;
    };
    await uiOptions.onFinish({
      responseMessage: { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Resposta' }] },
      isAborted: false,
    });
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
      requestId: canonicalRequestId,
      status: 'completed',
    }));
  });

  it('marks failures before the stream, sanitizes logs, and remains fail-open when telemetry cannot start', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.telemetryEnabled = true;
    mocks.retrieve.mockRejectedValueOnce(new Error('private retrieval details'));
    expect((await POST(request({ conversationId, messages }) as never)).status).toBe(500);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', errorCategory: 'request_processing_failed',
    }));
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('private retrieval details');
    expect(logged).not.toContain('Projetos?');
    expect(logged).not.toContain('203.0.113.10');

    vi.clearAllMocks();
    mocks.beginResult = null;
    mocks.retrieve.mockResolvedValue({ context: 'context', sources: [] });
    expect((await POST(request({ conversationId, messages }) as never)).status).toBe(200);
    expect(mocks.finish).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
