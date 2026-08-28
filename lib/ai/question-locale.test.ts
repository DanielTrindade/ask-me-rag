import { describe, expect, it } from 'vitest';
import { resolveQuestionLocale } from './question-locale';

describe('resolveQuestionLocale', () => {
  it.each([
    'What responsibilities did you have in your most recent project?',
    'Tell me about your experience with .NET and frontend.',
    'How do you use AI in software development?',
    'Where can I find your résumé?',
  ])('detecta pergunta em inglês: %s', (question) => {
    expect(resolveQuestionLocale(question, 'pt')).toBe('en');
  });

  it.each([
    'Quais responsabilidades você teve no projeto mais recente?',
    'Como você utiliza inteligência artificial no desenvolvimento?',
    'Qual e a sua experiencia com bancos de dados?',
    'Onde encontro o seu currículo?',
  ])('detecta pergunta em português: %s', (question) => {
    expect(resolveQuestionLocale(question, 'en')).toBe('pt');
  });

  it.each(['.NET?', 'RabbitMQ', 'C# e SQL', ''])('preserva o locale da interface em entrada ambígua: %s', (question) => {
    expect(resolveQuestionLocale(question, 'pt')).toBe('pt');
    expect(resolveQuestionLocale(question, 'en')).toBe('en');
  });

  it('usa o idioma predominante em vez de uma palavra isolada de outro idioma', () => {
    expect(resolveQuestionLocale('What is your experiência with .NET?', 'pt')).toBe('en');
    expect(resolveQuestionLocale('Como foi sua experience mais recente?', 'en')).toBe('pt');
  });
});
