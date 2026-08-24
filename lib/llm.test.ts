import { describe, expect, it } from 'vitest';
import { AiRuntimeConfigurationError } from '@/lib/ai/runtime-contracts';
import { resolveEmbeddingRuntime } from '@/lib/embeddings';
import { DEFAULT_GROQ_CHAT_MODEL, resolveChatRuntime } from '@/lib/llm';

const groqEnv = {
  NODE_ENV: 'test',
  GROQ_API_KEY: 'groq-placeholder',
  GOOGLE_GENERATIVE_AI_API_KEY: 'google-placeholder',
};

describe('resolveChatRuntime', () => {
  it('usa Groq GPT-OSS 20B como padrão', () => {
    const runtime = resolveChatRuntime(groqEnv);

    expect(runtime).toMatchObject({
      role: 'chat',
      provider: 'groq',
      modelId: DEFAULT_GROQ_CHAT_MODEL,
      displayName: DEFAULT_GROQ_CHAT_MODEL,
      capabilities: { streaming: true, thinkingControl: true },
    });
    expect(runtime.providerOptions).toEqual({
      groq: { reasoningEffort: 'low', reasoningFormat: 'hidden' },
    });
  });

  it('aceita override explícito de modelo Groq', () => {
    const runtime = resolveChatRuntime({
      ...groqEnv,
      CHAT_LLM_MODEL: 'openai/gpt-oss-120b',
    });

    expect(runtime.modelId).toBe('openai/gpt-oss-120b');
  });

  it('mantém o embedding Google independente do chat Groq', () => {
    const env = { ...groqEnv, CHAT_LLM_PROVIDER: 'groq' };
    const chat = resolveChatRuntime(env);
    const embedding = resolveEmbeddingRuntime(env);

    expect(chat.provider).toBe('groq');
    expect(embedding.provider).toBe('google');
    expect(embedding.modelId).toBe('gemini-embedding-001');
  });

  it.each(['google', 'vertex', 'anthropic', 'openai', 'unknown'])(
    'rejeita o provider legado ou desconhecido %s',
    (provider) => {
      expect(() =>
        resolveChatRuntime({ ...groqEnv, CHAT_LLM_PROVIDER: provider }),
      ).toThrow(AiRuntimeConfigurationError);
    },
  );

  it('rejeita credencial Groq ausente', () => {
    expect(() =>
      resolveChatRuntime({ ...groqEnv, GROQ_API_KEY: '' }),
    ).toThrow(AiRuntimeConfigurationError);
  });
});
