import { describe, it, expect, afterEach } from 'vitest';
import { getProvider, getChatProviderOptions } from '@/lib/llm';

afterEach(() => {
  delete process.env.LLM_PROVIDER;
  delete process.env.GOOGLE_MODEL;
});

describe('getProvider', () => {
  it('defaults to google when unset', () => {
    expect(getProvider()).toBe('google');
  });
  it('returns anthropic when LLM_PROVIDER=anthropic', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    expect(getProvider()).toBe('anthropic');
  });
  it('returns openai when LLM_PROVIDER=openai', () => {
    process.env.LLM_PROVIDER = 'openai';
    expect(getProvider()).toBe('openai');
  });
  it('returns google when LLM_PROVIDER=google', () => {
    process.env.LLM_PROVIDER = 'google';
    expect(getProvider()).toBe('google');
  });
  it('falls back to google for unknown values', () => {
    process.env.LLM_PROVIDER = 'banana';
    expect(getProvider()).toBe('google');
  });
});

describe('getChatProviderOptions', () => {
  it('disables thinking for Gemini 2.x models', () => {
    process.env.GOOGLE_MODEL = 'gemini-2.5-flash';
    expect(getChatProviderOptions('google')).toEqual({
      google: { thinkingConfig: { thinkingBudget: 0 } },
    });
  });
  it('disables thinking for the default model when GOOGLE_MODEL is unset', () => {
    expect(getChatProviderOptions('google')).toEqual({
      google: { thinkingConfig: { thinkingBudget: 0 } },
    });
  });
  it('caps thinking at the lowest level for Gemini 3+ models', () => {
    process.env.GOOGLE_MODEL = 'gemini-3.5-flash';
    expect(getChatProviderOptions('google')).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'low' } },
    });
  });
  it('returns undefined for non-google providers', () => {
    expect(getChatProviderOptions('anthropic')).toBeUndefined();
    expect(getChatProviderOptions('openai')).toBeUndefined();
  });
});
