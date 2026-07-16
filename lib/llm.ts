import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export type Provider = 'anthropic' | 'openai' | 'google';

const DEFAULT_GOOGLE_MODEL = 'gemini-2.5-flash';

export function getProvider(): Provider {
  const provider = process.env.LLM_PROVIDER;
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai') return 'openai';
  return 'google';
}

export function getModelName(provider: Provider = getProvider()) {
  if (provider === 'anthropic') return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  if (provider === 'openai') return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  return process.env.GOOGLE_MODEL ?? DEFAULT_GOOGLE_MODEL;
}

export function getModel(provider: Provider = getProvider()): LanguageModel {
  const model = getModelName(provider);
  if (provider === 'anthropic') return anthropic(model);
  if (provider === 'openai') return openai(model);
  return google(model);
}

// Gemini models think by default, which costs 6-30s of time-to-first-token on
// simple portfolio Q&A. Chat answers here are extractive (context-grounded),
// so thinking adds latency without quality gains.
export function getChatProviderOptions(provider: Provider = getProvider()) {
  if (provider !== 'google') return undefined;
  const model = process.env.GOOGLE_MODEL ?? DEFAULT_GOOGLE_MODEL;
  // Gemini 3+ rejects thinkingBudget and cannot fully disable thinking; cap
  // it at the lowest level instead.
  if (/^gemini-[3-9]/.test(model)) {
    return { google: { thinkingConfig: { thinkingLevel: 'low' as const } } };
  }
  return { google: { thinkingConfig: { thinkingBudget: 0 } } };
}
