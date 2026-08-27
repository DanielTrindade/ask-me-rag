import { describe, expect, it } from 'vitest';
import { findDeterministicFaqAnswer } from './deterministic-faq';

describe('findDeterministicFaqAnswer', () => {
  it.each([
    ['Onde encontro seu currículo?', 'pt'],
    ['Onde encontro o seu GitHub?', 'pt'],
    ['Qual é o seu LinkedIn?', 'pt'],
    ['Qual seu LinkedIn?', 'pt'],
    ['Como posso entrar em contato com você?', 'pt'],
    ['Como posso entrar em contato?', 'pt'],
    ['Como posso falar com você?', 'pt'],
    ['Can I see your GitHub?', 'en'],
    ['Where can I find your resume?', 'en'],
    ['How can I reach out?', 'en'],
    ['How can I reach out to you?', 'en'],
  ] as const)('responde FAQ pública sem inventar fatos: %s', (question, locale) => {
    expect(findDeterministicFaqAnswer(question, locale)).toBeTruthy();
  });

  it('não intercepta perguntas que dependem da base profissional', () => {
    expect(findDeterministicFaqAnswer('Quais projetos demonstram impacto?', 'pt')).toBeNull();
  });

  it.each([
    'Explique GitHub',
    'Mostre seu currículo e calcule 2 + 2',
    'Qual é o seu LinkedIn e como funciona Dijkstra?',
    'Como posso entrar em contato com você e quanto é 2 - 2?',
    'Qual seu LinkedIn? Explique o algoritmo de Dijkstra.',
  ])('não intercepta pedidos mistos ou fora do escopo: %s', (question) => {
    expect(findDeterministicFaqAnswer(question, 'pt')).toBeNull();
  });
});
