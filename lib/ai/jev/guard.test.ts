import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  askInput: vi.fn(),
  askPassage: vi.fn(),
  askGroundedness: vi.fn(),
}));

vi.mock('@/lib/ai/jev/input-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/jev/input-guard')>()),
  askInputGuard: (input: unknown) => mocks.askInput(input),
}));

vi.mock('@/lib/ai/jev/passage-guard', () => ({
  askPassageGuard: (chunks: unknown) => mocks.askPassage(chunks),
}));

vi.mock('@/lib/ai/jev/groundedness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/jev/groundedness')>()),
  askGroundednessGuard: (input: unknown) => mocks.askGroundedness(input),
}));

import {
  activeJevStages,
  resolveJevModes,
  runGroundednessGuard,
  runInputGuard,
  runPassageGuard,
} from '@/lib/ai/jev/guard';

const flags = {
  inputGuardEnabled: true,
  passageGuardEnabled: false,
  groundednessEnabled: true,
  shadow: false,
};

function inputAnswers(overrides: Record<string, unknown> = {}) {
  return {
    instruction_override: { type: 'noul', noul: 0.02 },
    formatting_anchor: { type: 'noul', noul: 0.03 },
    competence_bridge: { type: 'noul', noul: 0.02 },
    career_frame_external_task: { type: 'noul', noul: 0.02 },
    system_prompt_extraction: { type: 'noul', noul: 0.01 },
    external_content_request: { type: 'noul', noul: 0.05 },
    severity: { type: 'score', score: 0.1, confidence: 0.9 },
    scope: { type: 'choice', choice: 'in_scope', confidence: 0.9 },
    ...overrides,
  };
}

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('resolveJevModes', () => {
  it('desliga tudo sem chave da TypeSafe', () => {
    expect(resolveJevModes({ ...flags, shadow: true }, false)).toEqual({
      input: 'off',
      passage: 'off',
      groundedness: 'off',
    });
  });

  it('ativa só os estágios ligados', () => {
    const modes = resolveJevModes(flags, true);
    expect(modes).toEqual({ input: 'active', passage: 'off', groundedness: 'active' });
    expect(activeJevStages(modes)).toEqual(['input', 'groundedness']);
  });

  it('sombra sobrepõe as flags e roda os três estágios sem ativar nenhum', () => {
    const modes = resolveJevModes({ ...flags, shadow: true }, true);
    expect(modes).toEqual({ input: 'shadow', passage: 'shadow', groundedness: 'shadow' });
    expect(activeJevStages(modes)).toEqual([]);
  });
});

describe('runInputGuard', () => {
  it.each([
    ['pt', 'Quais projetos melhor demonstram seu impacto? Responda com exemplos.'],
    ['en', 'Which projects best show your impact? Answer with examples.'],
  ])('decide e registra sinais sem conteúdo da conversa (%s)', async (_, question) => {
    mocks.askInput.mockResolvedValue({
      ok: true,
      answers: inputAnswers(),
      model: 'jev-1.13.0',
      inputTokens: 900,
      costUsd: 0.0000378,
      durationMs: 120,
    });

    const outcome = await runInputGuard({
      requestId: 'req-1',
      mode: 'active',
      question,
      recentTurns: [],
      regexHazard: null,
    });

    expect(outcome).toMatchObject({ ok: true, decision: { action: 'pass' } });
    const [tag, payload] = info.mock.calls[0] as [string, string];
    expect(tag).toBe('[chat-guard]');
    const logged = JSON.parse(payload);
    expect(logged).toMatchObject({
      requestId: 'req-1',
      stage: 'input',
      mode: 'active',
      outcome: 'decided',
      action: 'pass',
      model: 'jev-1.13.0',
    });
    expect(payload).not.toContain(question);
  });

  it('libera falso positivo da regex quando o Jev julga a pergunta legítima', async () => {
    mocks.askInput.mockResolvedValue({
      ok: true,
      answers: inputAnswers(),
      model: 'jev-1.13.0',
      inputTokens: 900,
      costUsd: 0,
      durationMs: 120,
    });
    // "Responda com exemplos" dispara o padrão F1 da regex hoje.
    const outcome = await runInputGuard({
      requestId: 'req-1',
      mode: 'active',
      question: 'Quais projetos melhor demonstram seu impacto? Responda com exemplos.',
      recentTurns: [],
      regexHazard: 'formatting_anchor',
    });
    expect(outcome).toMatchObject({ ok: true, decision: { action: 'pass' } });
  });

  it('devolve falha sem lançar', async () => {
    mocks.askInput.mockResolvedValue({ ok: false, category: 'timeout', durationMs: 2500 });
    const outcome = await runInputGuard({
      requestId: 'req-1',
      mode: 'shadow',
      question: 'Projetos?',
      recentTurns: [],
      regexHazard: null,
    });
    expect(outcome).toEqual({ ok: false, failure: 'timeout' });
    expect(JSON.parse((info.mock.calls[0] as [string, string])[1])).toMatchObject({
      outcome: 'failed',
      failure: 'timeout',
    });
  });
});

describe('runPassageGuard', () => {
  it('não chama o Jev sem trechos', async () => {
    await expect(runPassageGuard({ requestId: 'r', mode: 'active', chunks: [] }))
      .resolves.toEqual({ ok: true, quarantined: [] });
    expect(mocks.askPassage).not.toHaveBeenCalled();
  });

  it('devolve os índices em quarentena', async () => {
    mocks.askPassage.mockResolvedValue({
      ok: true,
      answers: {},
      probabilities: [0.1, 0.95],
      model: 'jev-1.13.0',
      inputTokens: 400,
      costUsd: 0,
      durationMs: 90,
    });
    await expect(runPassageGuard({ requestId: 'r', mode: 'active', chunks: ['a', 'b'] }))
      .resolves.toEqual({ ok: true, quarantined: [1] });
  });
});

describe('runGroundednessGuard', () => {
  it('gradua a fundamentação', async () => {
    mocks.askGroundedness.mockResolvedValue({
      ok: true,
      answers: {
        fully_supported: { type: 'noul', noul: 0.6 },
        injected_content: { type: 'noul', noul: 0.02 },
        external_knowledge: { type: 'noul', noul: 0.04 },
        support_level: { type: 'score', score: 2.1, confidence: 0.8 },
      },
      model: 'jev-1.13.0',
      inputTokens: 1500,
      costUsd: 0,
      durationMs: 110,
    });
    const outcome = await runGroundednessGuard({
      requestId: 'r',
      mode: 'active',
      question: 'What did you build?',
      context: 'ctx',
      answer: 'I built a payments gateway.',
    });
    expect(outcome).toMatchObject({ ok: true, decision: { action: 'limited' } });
  });
});
