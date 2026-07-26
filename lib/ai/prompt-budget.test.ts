import { describe, expect, it } from 'vitest';
import type { PortfolioUIMessage } from '@/lib/chat-types';
import {
  buildPromptBudget,
  estimateTextTokens,
  truncateTextToTokenBudget,
} from './prompt-budget';

function message(id: string, role: 'user' | 'assistant', text: string): PortfolioUIMessage {
  return { id, role, parts: [{ type: 'text', text }] };
}

describe('estimateTextTokens', () => {
  it.each([
    ['Português com acentuação e çã.', 1],
    ['English words and punctuation.', 1],
    ['Unicode: 👩🏽‍💻 — 日本語', 1],
    ['# Markdown\n\n- item **forte** `code`', 1],
  ])('estima deterministicamente %s', (text, minimum) => {
    expect(estimateTextTokens(text)).toBeGreaterThanOrEqual(minimum);
    expect(estimateTextTokens(text)).toBe(estimateTextTokens(text));
  });
  it('retorna zero para texto vazio', () => expect(estimateTextTokens('')).toBe(0));
  it('é conservador para ASCII e Unicode', () => {
    expect(estimateTextTokens('a'.repeat(300))).toBeGreaterThanOrEqual(100);
    expect(estimateTextTokens('😀'.repeat(30))).toBeGreaterThanOrEqual(40);
  });
});

describe('buildPromptBudget', () => {
  const messages = [
    message('u1', 'user', 'pergunta antiga '.repeat(20)),
    message('a1', 'assistant', 'resposta antiga '.repeat(20)),
    message('u2', 'user', 'pergunta recente'),
    message('a2', 'assistant', 'resposta recente'),
    message('u3', 'user', 'pergunta atual'),
  ];

  it('preserva system prompt, pergunta atual e os turnos completos mais recentes', () => {
    const result = buildPromptBudget({
      systemPrompt: 'system', messages, currentMessageId: 'u3',
      historyTokenBudget: 30, totalInputTokenBudget: 100,
    });
    expect(result.messages.map(({ id }) => id)).toEqual(['u2', 'a2', 'u3']);
    expect(result.estimatedInputTokens).toBeLessThanOrEqual(100);
  });

  it('remove pares antigos completos e nunca remove a pergunta atual', () => {
    const result = buildPromptBudget({
      systemPrompt: 'system', messages, currentMessageId: 'u3',
      historyTokenBudget: 1, totalInputTokenBudget: 100,
    });
    expect(result.messages.map(({ id }) => id)).toEqual(['u3']);
  });

  it('rejeita quando o conteúdo obrigatório sozinho excede o total', () => {
    expect(() => buildPromptBudget({
      systemPrompt: 's'.repeat(1_000), messages, currentMessageId: 'u3',
      historyTokenBudget: 10, totalInputTokenBudget: 10,
    })).toThrow('required_content_exceeds_budget');
  });
});

describe('truncateTextToTokenBudget', () => {
  it('trunca em fronteira legível dentro do teto', () => {
    const result = truncateTextToTokenBudget(
      'Primeira frase completa. Segunda frase muito extensa '.repeat(20),
      20,
    );
    expect(result).toMatch(/[.!?]$/);
    expect(estimateTextTokens(result)).toBeLessThanOrEqual(20);
  });
});
