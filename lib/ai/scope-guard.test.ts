import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  choice: vi.fn((value) => value),
}));

vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { choice: mocks.choice },
}));

import {
  PORTFOLIO_SCOPE_POLICY,
  classifyPortfolioScope,
  selectRecentScopeTurns,
} from '@/lib/ai/scope-guard';

describe('portfolio scope guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateText.mockResolvedValue({
      output: 'out_of_scope',
      totalUsage: { inputTokens: 20, outputTokens: 2, totalTokens: 22 },
    });
  });

  it('define tecnologia genérica e pedido misto como fora do escopo', () => {
    expect(PORTFOLIO_SCOPE_POLICY).toContain('Explique o algoritmo de Dijkstra');
    expect(PORTFOLIO_SCOPE_POLICY).toContain('mixed request');
  });

  it('usa saída estruturada estrita, baixa variância e timeout curto', async () => {
    const runtime = {
      model: { modelId: 'openai/gpt-oss-20b' },
      providerOptions: { groq: { reasoningEffort: 'low', reasoningFormat: 'hidden' } },
    } as never;

    await expect(classifyPortfolioScope({
      question: 'Qual o algoritmo de Dijkstra?',
      recentTurns: [],
      runtime,
    })).resolves.toEqual({
      decision: 'out_of_scope',
      usage: { inputTokens: 20, outputTokens: 2, totalTokens: 22 },
    });

    expect(mocks.choice).toHaveBeenCalledWith({
      options: ['in_scope', 'out_of_scope'],
      name: 'portfolio_scope_decision',
      description: expect.stringContaining('professional portfolio'),
    });
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 16,
      temperature: 0,
      maxRetries: 0,
      timeout: 5_000,
      providerOptions: { groq: expect.objectContaining({
        structuredOutputs: true,
        strictJsonSchema: true,
      }) },
    }));
  });

  it('envia somente as duas mensagens anteriores ao classificar um follow-up', () => {
    const messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Sua trajetória?' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Resumo.' }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'E no frontend?' }] },
    ] as never;

    expect(selectRecentScopeTurns(messages, 'u2')).toEqual([
      { role: 'user', content: 'Sua trajetória?' },
      { role: 'assistant', content: 'Resumo.' },
    ]);
  });
});
