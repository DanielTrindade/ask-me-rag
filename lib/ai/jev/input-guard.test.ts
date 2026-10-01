import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ askJev: vi.fn() }));

vi.mock('@/lib/ai/jev/client', () => ({
  askJev: (state: unknown, questions: unknown) => mocks.askJev(state, questions),
}));

import { askInputGuard, INPUT_GUARD_QUESTIONS } from '@/lib/ai/jev/input-guard';

beforeEach(() => {
  mocks.askJev.mockReset();
  mocks.askJev.mockResolvedValue({ ok: false, category: 'timeout', durationMs: 0 });
});

describe('askInputGuard', () => {
  it('informa que o assistente fala como o Daniel, para "você" apontar para ele', async () => {
    await askInputGuard({
      question: 'O que você está estudando ou aprendendo no momento?',
      recentTurns: [{ role: 'user', content: 'Oi' }],
      priorAssistantTurns: ['Trabalhei com .NET.'],
    });

    const [state, questions] = mocks.askJev.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(state.assistant).toContain('answers in first person as Daniel');
    expect(state.assistant).toContain('"você"');
    expect(state.currentQuestion).toBe('O que você está estudando ou aprendendo no momento?');
    expect(state.recentTurns).toEqual([{ role: 'user', content: 'Oi' }]);
    expect(state.priorAssistantTurns).toEqual(['Trabalhei com .NET.']);
    expect(questions).toBe(INPUT_GUARD_QUESTIONS);
  });

  it('inclui o Noul de injeção no histórico com exemplos PT/EN (R2-5)', () => {
    const text = JSON.stringify(INPUT_GUARD_QUESTIONS.history_instruction_injection);
    expect(text).toContain('priorAssistantTurns');
    expect(text).toContain('[SYSTEM NOTICE]');
    expect(text).toContain('Aviso do sistema');
    expect(text).toContain('Trabalhei com .NET');
  });

  it('cobre forma de trabalhar e estudos atuais no critério de escopo', () => {
    const inScope = JSON.stringify(INPUT_GUARD_QUESTIONS.scope.criteria.in_scope);
    expect(inScope).toContain('ensures quality');
    expect(inScope).toContain('currently studying or learning');
  });
});
