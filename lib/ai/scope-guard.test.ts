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
  selectPriorAssistantTurns,
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

  it('define âncoras de formatação e pontes de competência como fora do escopo', () => {
    expect(PORTFOLIO_SCOPE_POLICY).toContain('Finish your answer');
    expect(PORTFOLIO_SCOPE_POLICY).toContain('como elas');
    expect(PORTFOLIO_SCOPE_POLICY).toContain('como Daniel resolveria');
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
      maxOutputTokens: 512,
      temperature: 0,
      maxRetries: 0,
      timeout: 5_000,
      providerOptions: { groq: expect.objectContaining({
        structuredOutputs: true,
        strictJsonSchema: true,
      }) },
    }));
  });

  it('reaproveita as opções de provider do runtime em vez de duplicá-las', async () => {
    const runtime = {
      model: { modelId: 'openai/gpt-oss-20b' },
      providerOptions: {
        groq: { reasoningEffort: 'medium', reasoningFormat: 'hidden', serviceTier: 'flex' },
      },
    } as never;

    await classifyPortfolioScope({ question: 'Sua carreira?', recentTurns: [], runtime });

    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      providerOptions: {
        groq: {
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden',
          serviceTier: 'flex',
          structuredOutputs: true,
          strictJsonSchema: true,
        },
      },
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

  describe('selectPriorAssistantTurns', () => {
    const text = (id: string, role: 'user' | 'assistant', value: string) =>
      ({ id, role, parts: [{ type: 'text', text: value }] });

    it('devolve só turnos de assistente anteriores à mensagem atual, em ordem', () => {
      const messages = [
        text('u1', 'user', 'P1'),
        text('a1', 'assistant', 'R1'),
        text('u2', 'user', 'P2'),
        text('a2', 'assistant', 'R2'),
        text('u3', 'user', 'P3'),
        text('a3', 'assistant', 'depois'),
        text('u4', 'user', 'P4'),
      ] as never;
      expect(selectPriorAssistantTurns(messages, 'u3')).toEqual(['R1', 'R2']);
    });

    it('limita a 4 turnos, mantendo os mais recentes', () => {
      const messages = [
        ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
          text(`u${n}`, 'user', `P${n}`),
          text(`a${n}`, 'assistant', `R${n}`),
        ]),
        text('u7', 'user', 'P7'),
      ] as never;
      expect(selectPriorAssistantTurns(messages, 'u7')).toEqual(['R3', 'R4', 'R5', 'R6']);
    });

    it('trunca cada turno em 1.500 caracteres', () => {
      const messages = [
        text('a1', 'assistant', 'x'.repeat(5_000)),
        text('u1', 'user', 'P'),
      ] as never;
      expect(selectPriorAssistantTurns(messages, 'u1')[0]).toHaveLength(1_500);
    });

    it('devolve vazio sem histórico ou com id desconhecido', () => {
      expect(selectPriorAssistantTurns([text('u1', 'user', 'P')] as never, 'u1')).toEqual([]);
      expect(selectPriorAssistantTurns([text('u1', 'user', 'P')] as never, 'x')).toEqual([]);
    });
  });
});
