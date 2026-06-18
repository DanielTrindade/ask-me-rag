import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type Provider = 'anthropic' | 'openai';

export function getProvider(): Provider {
  return process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic';
}

export function getModel(provider: Provider = getProvider()): LanguageModel {
  if (provider === 'openai') {
    return openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }
  return anthropic(process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6');
}
