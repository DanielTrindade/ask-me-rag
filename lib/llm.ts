import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export type Provider = 'anthropic' | 'openai' | 'google';

export function getProvider(): Provider {
  const provider = process.env.LLM_PROVIDER;
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai') return 'openai';
  return 'google';
}

export function getModel(provider: Provider = getProvider()): LanguageModel {
  if (provider === 'anthropic') {
    return anthropic(process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6');
  }
  if (provider === 'openai') {
    return openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }
  return google(process.env.GOOGLE_MODEL ?? 'gemini-3.5-flash');
}
