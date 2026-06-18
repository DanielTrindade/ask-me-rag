import { describe, it, expect, afterEach } from 'vitest';
import { getProvider } from '@/lib/llm';

afterEach(() => {
  delete process.env.LLM_PROVIDER;
});

describe('getProvider', () => {
  it('defaults to anthropic when unset', () => {
    expect(getProvider()).toBe('anthropic');
  });
  it('returns openai when LLM_PROVIDER=openai', () => {
    process.env.LLM_PROVIDER = 'openai';
    expect(getProvider()).toBe('openai');
  });
  it('falls back to anthropic for unknown values', () => {
    process.env.LLM_PROVIDER = 'banana';
    expect(getProvider()).toBe('anthropic');
  });
});
