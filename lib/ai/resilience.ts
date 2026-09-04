import 'server-only';

import type { LanguageModelMiddleware } from 'ai';

export type GenerationFailureCategory =
  | 'quota_exhausted'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'authentication_failed'
  | 'configuration_error'
  | 'invalid_request'
  | 'timeout'
  | 'aborted'
  | 'retrieval_failed'
  | 'unknown_provider_error';

export type PublicChatFailure =
  | 'temporarily_limited'
  | 'temporarily_unavailable'
  | 'conversation_busy'
  | 'disabled';

export interface ClassifiedGenerationFailure {
  category: GenerationFailureCategory;
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
}

type ErrorPhase = 'provider' | 'retrieval';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function unwrapRetryError(error: unknown) {
  const value = record(error);
  const errors = value?.errors;
  return Array.isArray(errors) && errors.length > 0 ? errors.at(-1) : error;
}

function readStatus(value: Record<string, unknown> | undefined) {
  const status = value?.statusCode ?? value?.status;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

function retryAfterMs(value: Record<string, unknown> | undefined) {
  const headers = record(value?.responseHeaders);
  const raw = headers?.['retry-after-ms'] ?? headers?.['retry-after'];
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const text = String(raw).trim();
  const number = Number(text);
  const milliseconds = Number.isFinite(number)
    ? (headers?.['retry-after-ms'] !== undefined ? number : number * 1_000)
    : Date.parse(text) - Date.now();
  return Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 60_000
    ? Math.round(milliseconds)
    : undefined;
}

export function classifyGenerationError(
  error: unknown,
  phase: ErrorPhase = 'provider',
): ClassifiedGenerationFailure {
  if (phase === 'retrieval') return { category: 'retrieval_failed', retryable: false };

  const unwrapped = unwrapRetryError(error);
  const value = record(unwrapped);
  const name = typeof value?.name === 'string' ? value.name : undefined;
  const statusCode = readStatus(value);
  const retryDelay = retryAfterMs(value);
  const providerRetryable = value?.isRetryable === true;

  if (name === 'AbortError' || value?.code === 'ABORT_ERR') {
    return { category: 'aborted', retryable: false };
  }
  if (
    name === 'ChatUsageConfigurationError' ||
    name === 'AiRuntimeConfigurationError' ||
    name === 'ConfigurationError'
  ) {
    return { category: 'configuration_error', retryable: false };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { category: 'authentication_failed', retryable: false, statusCode };
  }
  if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
    return { category: 'invalid_request', retryable: false, statusCode };
  }
  if (statusCode === 408 || statusCode === 504 || name === 'TimeoutError') {
    return { category: 'timeout', retryable: true, statusCode, retryAfterMs: retryDelay };
  }
  if (statusCode === 429) {
    const retryable = providerRetryable || retryDelay !== undefined;
    return {
      category: retryable ? 'rate_limited' : 'quota_exhausted',
      retryable,
      statusCode,
      retryAfterMs: retryDelay,
    };
  }
  if (statusCode !== undefined && statusCode >= 500) {
    return {
      category: 'provider_unavailable',
      retryable: true,
      statusCode,
      retryAfterMs: retryDelay,
    };
  }
  return { category: 'unknown_provider_error', retryable: false, statusCode };
}

export interface SafeGenerationLog {
  requestId: string;
  provider?: string;
  model?: string;
  status: 'failed' | 'retrying' | 'aborted';
  category: GenerationFailureCategory;
  retryable: boolean;
  attempt: number;
  durationMs: number;
}

export function logGenerationFailure(input: SafeGenerationLog) {
  const safe: SafeGenerationLog = {
    requestId: input.requestId,
    provider: input.provider,
    model: input.model,
    status: input.status,
    category: input.category,
    retryable: input.retryable,
    attempt: input.attempt,
    durationMs: input.durationMs,
  };
  console.error('[chat-generation]', safe);
}

const DEGRADED_COPY = {
  pt: {
    temporarily_limited: 'O chat atingiu um limite temporário. Tente novamente mais tarde.',
    temporarily_unavailable: 'O chat está indisponível no momento. Tente novamente em alguns instantes.',
    conversation_busy: 'Esta conversa já está gerando uma resposta. Aguarde a conclusão.',
    disabled: 'O chat está temporariamente desativado.',
  },
  en: {
    temporarily_limited: 'The chat reached a temporary limit. Please try again later.',
    temporarily_unavailable: 'The chat is currently unavailable. Please try again shortly.',
    conversation_busy: 'This conversation is already generating a response. Please wait.',
    disabled: 'The chat is temporarily disabled.',
  },
} as const;

export function resolveChatLocale(acceptLanguage: string | null): 'pt' | 'en' {
  return acceptLanguage?.trim().toLowerCase().startsWith('en') ? 'en' : 'pt';
}

export function degradedChatResponse(kind: PublicChatFailure, locale: 'pt' | 'en') {
  return {
    error: kind,
    message: DEGRADED_COPY[locale][kind],
    retryable: kind === 'temporarily_unavailable',
  };
}

interface RetryDependencies {
  maxRetries?: number;
  initialDelayMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  onRetry?: (event: {
    attempt: number;
    delayMs: number;
    failure: ClassifiedGenerationFailure;
  }) => void;
}

function defaultSleep(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export function createPreStreamRetryMiddleware(
  dependencies: RetryDependencies = {},
): LanguageModelMiddleware {
  const maxRetries = dependencies.maxRetries ?? 2;
  const initialDelayMs = dependencies.initialDelayMs ?? 250;
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;

  async function retryLoop<T>(call: () => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    let retry = 0;
    while (true) {
      try {
        return await call();
      } catch (error) {
        const failure = classifyGenerationError(error);
        if (!failure.retryable || retry >= maxRetries || signal?.aborted) {
          throw error;
        }
        retry += 1;
        const exponential = initialDelayMs * (2 ** (retry - 1));
        const jitter = Math.round(exponential * 0.25 * random());
        const delayMs = Math.max(exponential + jitter, failure.retryAfterMs ?? 0);
        dependencies.onRetry?.({ attempt: retry + 1, delayMs, failure });
        await sleep(delayMs, signal);
      }
    }
  }

  return {
    specificationVersion: 'v3',
    async wrapGenerate({ doGenerate, params }) {
      return retryLoop(() => doGenerate(), params.abortSignal);
    },
    async wrapStream({ doStream, params }) {
      return retryLoop(() => doStream(), params.abortSignal);
    },
  };
}
