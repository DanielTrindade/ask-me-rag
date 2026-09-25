import 'server-only';

import {
  APITimeoutError,
  APIUserAbortError,
  RateLimitError,
  TypeSafeClient,
  type EntryType,
  type Questions,
  type SystemOneResult,
} from '@typesafe-ai/sdk';

/**
 * Versão fixa, não o alias `jev-latest`: os thresholds de `policy.ts` são
 * calibrados contra uma versão específica, e o alias muda sozinho quando sai
 * release nova. `TYPESAFE_MODEL` permite migrar sem deploy de código.
 */
export const JEV_DEFAULT_MODEL = 'jev-1.13.0';

/** Timeout por tentativa; o SDK não tem orçamento total, então a rota impõe um. */
export const JEV_ATTEMPT_TIMEOUT_MS = 1_500;
export const JEV_TOTAL_BUDGET_MS = 2_500;

/** Preço por token de entrada (US$ 0,042 / Mtok); saída é grátis. */
export const JEV_INPUT_PRICE_PER_TOKEN_USD = 0.042 / 1_000_000;

export type JevFailureCategory =
  | 'not_configured'
  | 'timeout'
  | 'rate_limited'
  | 'provider_error';

export type JevCallResult<Q extends Questions> =
  | {
      ok: true;
      answers: SystemOneResult<Q>['answers'];
      model: string;
      inputTokens: number;
      costUsd: number;
      durationMs: number;
    }
  | { ok: false; category: JevFailureCategory; durationMs: number };

let client: TypeSafeClient | null = null;

export function isJevConfigured(env: Readonly<Record<string, string | undefined>> = process.env) {
  return Boolean(env.TYPESAFE_API_KEY?.trim());
}

function getClient() {
  client ??= new TypeSafeClient({
    defaultModel: process.env.TYPESAFE_MODEL?.trim() || JEV_DEFAULT_MODEL,
    timeout: JEV_ATTEMPT_TIMEOUT_MS,
    // Uma única tentativa extra, curta: o backoff padrão (500 ms dobrando até
    // 5 s, honrando Retry-After até 60 s) estouraria o orçamento da rota.
    retry: {
      maxRetries: 1,
      backoffInitialMs: 100,
      backoffMaxMs: 200,
      respectRetryAfter: false,
    },
    logLevel: 'off',
  });
  return client;
}

function classifyJevError(error: unknown): JevFailureCategory {
  if (error instanceof APITimeoutError || error instanceof APIUserAbortError) return 'timeout';
  if (error instanceof RateLimitError) return 'rate_limited';
  return 'provider_error';
}

/**
 * Faz uma chamada ao System One sem nunca lançar: qualquer falha vira
 * `{ ok: false }` para a rota cair no caminho Groq atual.
 */
export async function askJev<const Q extends Questions>(
  state: EntryType,
  questions: Q,
): Promise<JevCallResult<Q>> {
  const startedAt = performance.now();
  const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));
  if (!isJevConfigured()) return { ok: false, category: 'not_configured', durationMs: 0 };
  try {
    const result = await getClient().systemOne(
      { state, questions },
      { signal: AbortSignal.timeout(JEV_TOTAL_BUDGET_MS) },
    );
    const inputTokens = result.usage.input_tokens;
    return {
      ok: true,
      answers: result.answers,
      model: result.model,
      inputTokens,
      costUsd: inputTokens * JEV_INPUT_PRICE_PER_TOKEN_USD,
      durationMs: elapsed(),
    };
  } catch (error) {
    return { ok: false, category: classifyJevError(error), durationMs: elapsed() };
  }
}
