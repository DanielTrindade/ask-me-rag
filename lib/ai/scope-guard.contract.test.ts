import { describe, expect, it } from 'vitest';
import { createGroq } from '@ai-sdk/groq';
import {
  SCOPE_DECISION_MAX_OUTPUT_TOKENS,
  classifyPortfolioScope,
} from '@/lib/ai/scope-guard';

/**
 * scope-guard.test.ts mocka o módulo `ai` inteiro, então o corpo HTTP real nunca
 * é montado ali. Estes testes exercitam o provider de verdade contra um fetch
 * falso, que é o único jeito de flagrar sem credencial um request que o Groq
 * rejeitaria.
 */
async function captureGroqRequest() {
  let body: Record<string, unknown> | null = null;
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? '{}'));
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 0,
        model: 'openai/gpt-oss-20b',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{"result":"in_scope"}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 20, completion_tokens: 2, total_tokens: 22 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof globalThis.fetch;

  const runtime = {
    model: createGroq({ apiKey: 'test-key', fetch: fakeFetch })('openai/gpt-oss-20b'),
    providerOptions: { groq: { reasoningEffort: 'low', reasoningFormat: 'hidden' } },
  } as never;

  await classifyPortfolioScope({
    question: 'Resuma sua trajetória e principais competências.',
    recentTurns: [],
    runtime,
  });

  return body as unknown as Record<string, unknown>;
}

describe('contrato da requisição enviada ao Groq', () => {
  it('reserva orçamento de saída suficiente para o raciocínio antes do JSON', async () => {
    const body = await captureGroqRequest();

    // gpt-oss é modelo de reasoning e os tokens de raciocínio saem deste mesmo
    // orçamento. Com um teto apertado o modelo consome tudo antes de emitir o
    // JSON e o Groq responde 400 json_validate_failed com failed_generation "".
    expect(body.max_tokens).toBe(SCOPE_DECISION_MAX_OUTPUT_TOKENS);
    expect(SCOPE_DECISION_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(512);
  });

  it('pede saída estruturada estrita com as duas únicas decisões possíveis', async () => {
    const body = await captureGroqRequest();
    const responseFormat = body.response_format as {
      type: string;
      json_schema: { strict: boolean; schema: { properties: { result: { enum: string[] } } } };
    };

    expect(responseFormat.type).toBe('json_schema');
    expect(responseFormat.json_schema.strict).toBe(true);
    expect(responseFormat.json_schema.schema.properties.result.enum)
      .toEqual(['in_scope', 'out_of_scope']);
  });
});
