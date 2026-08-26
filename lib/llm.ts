import 'server-only';

import { createGroq } from '@ai-sdk/groq';
import {
  AiRuntimeConfigurationError,
  type ChatProvider,
  type ChatRuntime,
} from '@/lib/ai/runtime-contracts';

export const DEFAULT_GROQ_CHAT_MODEL = 'openai/gpt-oss-20b';

type EnvSource = Readonly<Record<string, string | undefined>>;

function requiredValue(env: EnvSource, name: string, role: 'chat') {
  const value = env[name]?.trim();
  if (!value) throw new AiRuntimeConfigurationError(role, name);
  return value;
}

function resolveProvider(env: EnvSource): ChatProvider {
  const value = (env.CHAT_LLM_PROVIDER ?? env.LLM_PROVIDER ?? 'groq').trim().toLowerCase();
  if (value === 'groq') return value;
  throw new AiRuntimeConfigurationError('chat', 'CHAT_LLM_PROVIDER');
}

function resolveModelId(env: EnvSource) {
  return env.CHAT_LLM_MODEL?.trim()
    || env.GROQ_MODEL?.trim()
    || DEFAULT_GROQ_CHAT_MODEL;
}

export function resolveChatRuntime(env: EnvSource = process.env): ChatRuntime {
  const provider = resolveProvider(env);
  const modelId = resolveModelId(env);
  const apiKey = requiredValue(env, 'GROQ_API_KEY', 'chat');
  const model = createGroq({ apiKey })(modelId);

  return {
    role: 'chat',
    provider,
    modelId,
    displayName: modelId,
    model,
    providerOptions: {
      groq: {
        reasoningEffort: 'low',
        reasoningFormat: 'hidden',
      },
    },
    capabilities: {
      streaming: true,
      thinkingControl: true,
    },
  };
}
