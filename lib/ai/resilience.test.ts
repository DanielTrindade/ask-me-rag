import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyGenerationError,
  createPreStreamRetryMiddleware,
  degradedChatResponse,
  logGenerationFailure,
  resolveChatLocale,
} from './resilience';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('classifyGenerationError', () => {
  it('distingue cota diária de limitação transitória', () => {
    expect(classifyGenerationError({ statusCode: 429 })).toMatchObject({
      category: 'quota_exhausted',
      retryable: false,
    });
    expect(classifyGenerationError({
      statusCode: 429,
      isRetryable: true,
      responseHeaders: { 'retry-after': '2' },
    })).toMatchObject({
      category: 'rate_limited',
      retryable: true,
      retryAfterMs: 2_000,
    });
  });

  it.each([
    [{ statusCode: 401 }, 'authentication_failed', false],
    [{ statusCode: 503 }, 'provider_unavailable', true],
    [{ name: 'TimeoutError' }, 'timeout', true],
    [{ name: 'AbortError' }, 'aborted', false],
    [{ statusCode: 400 }, 'invalid_request', false],
  ] as const)('classifica %o como %s', (error, category, retryable) => {
    expect(classifyGenerationError(error)).toMatchObject({ category, retryable });
  });

  it('classifica retrieval separadamente', () => {
    expect(classifyGenerationError(new Error('segredo'), 'retrieval')).toEqual({
      category: 'retrieval_failed',
      retryable: false,
    });
  });
});

describe('safe generation logging', () => {
  it('registra somente o contrato sanitizado', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logGenerationFailure({
      requestId: 'request-1',
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
      status: 'failed',
      category: 'provider_unavailable',
      retryable: true,
      attempt: 2,
      durationMs: 123,
    });
    const serialized = JSON.stringify(spy.mock.calls);
    expect(serialized).toContain('request-1');
    expect(serialized).not.toContain('prompt');
    expect(serialized).not.toContain('apiKey');
  });
});

describe('createPreStreamRetryMiddleware', () => {
  it('repete no máximo duas vezes com backoff antes do stream', async () => {
    const onRetry = vi.fn();
    const sleep = vi.fn(async () => undefined);
    const middleware = createPreStreamRetryMiddleware({
      maxRetries: 2,
      initialDelayMs: 100,
      random: () => 0,
      sleep,
      onRetry,
    });
    const doStream = vi.fn()
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValue({ stream: 'ok' });

    await expect(middleware.wrapStream!({
      doStream,
      params: {},
      model: {} as never,
    } as never)).resolves.toEqual({ stream: 'ok' });
    expect(doStream).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100, undefined);
    expect(sleep).toHaveBeenNthCalledWith(2, 200, undefined);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('não repete falha não retryable', async () => {
    const middleware = createPreStreamRetryMiddleware();
    const error = { statusCode: 401 };
    const doStream = vi.fn().mockRejectedValue(error);
    await expect(middleware.wrapStream!({
      doStream,
      params: {},
      model: {} as never,
    } as never)).rejects.toBe(error);
    expect(doStream).toHaveBeenCalledTimes(1);
  });

  it('repete geração em buffer (wrapGenerate) com o mesmo backoff', async () => {
    const onRetry = vi.fn();
    const sleep = vi.fn(async () => undefined);
    const middleware = createPreStreamRetryMiddleware({
      maxRetries: 2,
      initialDelayMs: 100,
      random: () => 0,
      sleep,
      onRetry,
    });
    const doGenerate = vi.fn()
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValue({ text: 'Resposta' });

    await expect(middleware.wrapGenerate!({
      doGenerate,
      params: {},
      model: {} as never,
    } as never)).resolves.toEqual({ text: 'Resposta' });
    expect(doGenerate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100, undefined);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('não repete geração em buffer quando o sinal está abortado', async () => {
    const middleware = createPreStreamRetryMiddleware();
    const error = { statusCode: 503 };
    const doGenerate = vi.fn().mockRejectedValue(error);
    await expect(middleware.wrapGenerate!({
      doGenerate,
      params: { abortSignal: { aborted: true } },
      model: {} as never,
    } as never)).rejects.toBe(error);
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('degraded chat copy', () => {
  it('fornece respostas seguras em PT e EN', () => {
    expect(degradedChatResponse('temporarily_limited', 'pt')).toMatchObject({
      error: 'temporarily_limited',
      retryable: false,
    });
    expect(degradedChatResponse('temporarily_unavailable', 'en')).toMatchObject({
      error: 'temporarily_unavailable',
      retryable: true,
    });
    expect(degradedChatResponse('disabled', 'pt').message).not.toContain('quota');
  });

  it('resolve locale sem refletir entrada arbitrária', () => {
    expect(resolveChatLocale('en-US,en;q=0.9')).toBe('en');
    expect(resolveChatLocale('pt-BR')).toBe('pt');
  });
});
