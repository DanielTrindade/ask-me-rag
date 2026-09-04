import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDeterministicFaqAnswer } from './deterministic-faq';

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it('monta link Markdown com fallback seguro para o GitHub', () => {
    const answer = findDeterministicFaqAnswer('Qual é o seu LinkedIn?', 'pt');
    expect(answer).toContain('[Ver GitHub](https://github.com/DanielTrindade)');
    expect(answer).toContain('links profissionais');
  });

  it('usa as URLs configuradas para GitHub, LinkedIn e currículo', () => {
    vi.stubEnv('NEXT_PUBLIC_GITHUB_URL', 'https://github.com/daniel-me');
    vi.stubEnv('NEXT_PUBLIC_LINKEDIN_URL', 'https://linkedin.com/in/daniel-me');
    vi.stubEnv('NEXT_PUBLIC_RESUME_URL', 'https://example.com/resume.pdf');

    const answer = findDeterministicFaqAnswer('Como posso entrar em contato com você?', 'pt');
    expect(answer).toContain('[Ver GitHub](https://github.com/daniel-me)');
    expect(answer).toContain('[LinkedIn](https://linkedin.com/in/daniel-me)');
    expect(answer).toContain('[Ver currículo](https://example.com/resume.pdf)');
  });

  it('omite LinkedIn e currículo quando não configurados', () => {
    vi.stubEnv('NEXT_PUBLIC_GITHUB_URL', 'https://github.com/daniel-me');
    vi.stubEnv('NEXT_PUBLIC_LINKEDIN_URL', '');
    vi.stubEnv('NEXT_PUBLIC_RESUME_URL', '');

    const answer = findDeterministicFaqAnswer('How can I reach out?', 'en');
    expect(answer).toContain('[View GitHub](https://github.com/daniel-me)');
    expect(answer).not.toContain('[LinkedIn]');
    expect(answer).not.toContain('résumé');
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