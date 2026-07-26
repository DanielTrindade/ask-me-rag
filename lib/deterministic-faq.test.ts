import { describe, expect, it } from 'vitest';
import { findDeterministicFaqAnswer } from './deterministic-faq';

describe('findDeterministicFaqAnswer', () => {
  it.each([
    ['Onde encontro seu currículo?', 'pt'],
    ['Can I see your GitHub?', 'en'],
    ['How can I reach out?', 'en'],
  ] as const)('responde FAQ pública sem inventar fatos: %s', (question, locale) => {
    expect(findDeterministicFaqAnswer(question, locale)).toBeTruthy();
  });

  it('não intercepta perguntas que dependem da base profissional', () => {
    expect(findDeterministicFaqAnswer('Quais projetos demonstram impacto?', 'pt')).toBeNull();
  });
});
