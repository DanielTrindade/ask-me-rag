import { describe, it, expect, afterEach } from 'vitest';
import { getProvider } from '@/lib/llm';

afterEach(() => {
  delete process.env.LLM_PROVIDER;
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
