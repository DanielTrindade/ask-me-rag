import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/rag';

describe('buildSystemPrompt', () => {
  it('includes the provided context', () => {
    const prompt = buildSystemPrompt('Daniel worked at ACME.');
    expect(prompt).toContain('Daniel worked at ACME.');
  });

  it('instructs the model not to invent answers', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt.toLowerCase()).toContain("don't know");
  });

  it('instructs the model to answer as Daniel in first person', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt).toContain('Answer in first person as Daniel');
    expect(prompt).toContain('Do not imply that Daniel is present');
  });
});
