import 'server-only';

import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { SharedV3ProviderOptions } from '@ai-sdk/provider';
import {
  AiRuntimeConfigurationError,
  type ChatProvider,
  type ChatRuntime,
} from '@/lib/ai/runtime-contracts';
import { createVertexRuntimeProvider } from '@/lib/ai/vertex';

export const DEFAULT_GOOGLE_CHAT_MODEL = 'gemini-2.5-flash-lite';

type EnvSource = Readonly<Record<string, string | undefined>>;

function requiredValue(env: EnvSource, name: string, role: 'chat' | 'embedding') {
  const value = env[name]?.trim();
  if (!value) throw new AiRuntimeConfigurationError(role, name);
  return value;
}

function resolveProvider(env: EnvSource): ChatProvider {
  const value = (env.CHAT_LLM_PROVIDER ?? env.LLM_PROVIDER ?? 'google').trim().toLowerCase();
  if (
    value === 'google'
    || value === 'vertex'
    || value === 'anthropic'
    || value === 'openai'
  ) return value;
  throw new AiRuntimeConfigurationError('chat', 'CHAT_LLM_PROVIDER');
}

function resolveModelId(provider: ChatProvider, env: EnvSource) {
  const explicitModel = env.CHAT_LLM_MODEL?.trim();
  if (explicitModel) return explicitModel;
  if (provider === 'anthropic') return env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6';
  if (provider === 'openai') return env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  if (provider === 'vertex') {
    return env.GOOGLE_VERTEX_MODEL?.trim() || DEFAULT_GOOGLE_CHAT_MODEL;
  }
  return env.GOOGLE_MODEL?.trim() || DEFAULT_GOOGLE_CHAT_MODEL;
}

function resolveProviderOptions(
  provider: ChatProvider,
  modelId: string,
): SharedV3ProviderOptions | undefined {
  if (provider !== 'google' && provider !== 'vertex') return undefined;
  if (/^gemini-[3-9]/.test(modelId)) {
    return { google: { thinkingConfig: { thinkingLevel: 'low' } } };
  }
  return { google: { thinkingConfig: { thinkingBudget: 0 } } };
}

export function resolveChatRuntime(env: EnvSource = process.env): ChatRuntime {
  const provider = resolveProvider(env);
  const modelId = resolveModelId(provider, env);

  if (provider === 'anthropic') {
    requiredValue(env, 'ANTHROPIC_API_KEY', 'chat');
  } else if (provider === 'openai') {
    requiredValue(env, 'OPENAI_API_KEY', 'chat');
  } else if (provider === 'google') {
    requiredValue(env, 'GOOGLE_GENERATIVE_AI_API_KEY', 'chat');
  }

  const model =
    provider === 'anthropic'
      ? anthropic(modelId)
      : provider === 'openai'
        ? openai(modelId)
        : provider === 'vertex'
          ? createVertexRuntimeProvider('chat', env)(modelId)
          : google(modelId);

  return {
    role: 'chat',
    provider,
    modelId,
    displayName: modelId,
    model,
    providerOptions: resolveProviderOptions(provider, modelId),
    capabilities: {
      streaming: true,
      thinkingControl: provider === 'google' || provider === 'vertex',
    },
  };
}
