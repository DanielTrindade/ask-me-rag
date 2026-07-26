import { describe, expect, it } from 'vitest';
import { AiRuntimeConfigurationError } from '@/lib/ai/runtime-contracts';
import { resolveEmbeddingRuntime } from '@/lib/embeddings';
import { DEFAULT_GOOGLE_CHAT_MODEL, resolveChatRuntime } from '@/lib/llm';

const googleEnv = {
  NODE_ENV: 'test',
  GOOGLE_GENERATIVE_AI_API_KEY: 'google-placeholder',
};

describe('resolveChatRuntime', () => {
  it('usa Google Flash-Lite como padrão free-first', () => {
    const runtime = resolveChatRuntime(googleEnv);

    expect(runtime).toMatchObject({
      role: 'chat',
      provider: 'google',
      modelId: DEFAULT_GOOGLE_CHAT_MODEL,
      displayName: DEFAULT_GOOGLE_CHAT_MODEL,
      capabilities: { streaming: true, thinkingControl: true },
    });
    expect(runtime.providerOptions).toEqual({
      google: { thinkingConfig: { thinkingBudget: 0 } },
    });
  });

  it('aceita override e limita thinking em modelos Gemini 3+', () => {
    const runtime = resolveChatRuntime({
      ...googleEnv,
      CHAT_LLM_MODEL: 'gemini-3.5-flash',
    });

    expect(runtime.modelId).toBe('gemini-3.5-flash');
    expect(runtime.providerOptions).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'low' } },
    });
  });

  it.each([
    ['anthropic', 'ANTHROPIC_API_KEY', 'anthropic-placeholder', 'claude-sonnet-4-6'],
    ['openai', 'OPENAI_API_KEY', 'openai-placeholder', 'gpt-4o-mini'],
  ] as const)(
    'resolve chat %s mantendo embedding Google independente',
    (provider, keyName, keyValue, expectedModel) => {
      const env = {
        ...googleEnv,
        CHAT_LLM_PROVIDER: provider,
        [keyName]: keyValue,
      };

      const chat = resolveChatRuntime(env);
      const embedding = resolveEmbeddingRuntime(env);

      expect(chat.provider).toBe(provider);
      expect(chat.modelId).toBe(expectedModel);
      expect(chat.providerOptions).toBeUndefined();
      expect(embedding.provider).toBe('google');
      expect(embedding.modelId).toBe('gemini-embedding-001');
    },
  );

  it('resolve Vertex por ADC sem alterar o embedding Google independente', () => {
    const env = {
      ...googleEnv,
      CHAT_LLM_PROVIDER: 'vertex',
      CHAT_VERTEX_PROJECT: 'chat-project',
      CHAT_VERTEX_LOCATION: 'us-central1',
    };
    const chat = resolveChatRuntime(env);
    const embedding = resolveEmbeddingRuntime(env);

    expect(chat).toMatchObject({
      provider: 'vertex',
      modelId: DEFAULT_GOOGLE_CHAT_MODEL,
      capabilities: { streaming: true, thinkingControl: true },
    });
    expect(chat.providerOptions).toEqual({
      google: { thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(embedding.provider).toBe('google');
  });

  it('rejeita provider desconhecido em vez de fazer fallback silencioso', () => {
    expect(() =>
      resolveChatRuntime({ ...googleEnv, CHAT_LLM_PROVIDER: 'unknown' }),
    ).toThrow(AiRuntimeConfigurationError);
  });

  it('rejeita credencial ausente para o provider selecionado', () => {
    expect(() =>
      resolveChatRuntime({
        ...googleEnv,
        CHAT_LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: '',
      }),
    ).toThrow(AiRuntimeConfigurationError);
  });
});
