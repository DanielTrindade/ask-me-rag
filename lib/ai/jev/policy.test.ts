import { describe, expect, it } from 'vitest';
import {
  decideGroundedness,
  decideInput,
  decidePassages,
  generationDirectiveFor,
} from '@/lib/ai/jev/policy';
import type { GroundednessSignals, InputSignals } from '@/lib/ai/jev/types';

const benignInput: InputSignals = {
  instructionOverride: 0.02,
  formattingAnchor: 0.03,
  competenceBridge: 0.05,
  careerFrameExternalTask: 0.04,
  systemPromptExtraction: 0.01,
  externalContentRequest: 0.06,
  contextReproductionRequest: 0.03,
  severity: 0.1,
  scope: 'in_scope',
  scopeConfidence: 0.92,
};

const supported: GroundednessSignals = {
  fullySupported: 0.9,
  injectedContent: 0.02,
  externalKnowledge: 0.05,
  supportLevel: 2.9,
  supportConfidence: 0.88,
  supportProbabilities: [0.01, 0.02, 0.07, 0.9],
};

describe('decideInput', () => {
  it('passa pergunta de portfólio em escopo e confiante', () => {
    expect(decideInput(benignInput).action).toBe('pass');
  });

  it('recusa extração de prompt a partir de 0,5', () => {
    const decision = decideInput({ ...benignInput, systemPromptExtraction: 0.55 });
    expect(decision.action).toBe('refuse');
    expect(decision.signals.map(({ hazard }) => hazard)).toContain('system_prompt_extraction');
  });

  it('recusa override forte e escala override incerto para o Groq', () => {
    expect(decideInput({ ...benignInput, instructionOverride: 0.8 }).action).toBe('refuse');
    expect(decideInput({ ...benignInput, instructionOverride: 0.5 }).action).toBe('fallback');
  });

  it('suaviza âncora de formatação em vez de recusar (F1)', () => {
    const decision = decideInput({ ...benignInput, formattingAnchor: 0.4 });
    expect(decision.action).toBe('soften');
    expect(generationDirectiveFor(decision)).toBe('soften');
  });

  it('suaviza pedido de despejo dos trechos com a diretiva no_reproduction (R2-1)', () => {
    const decision = decideInput({ ...benignInput, contextReproductionRequest: 0.6 });
    expect(decision.action).toBe('soften');
    expect(decision.signals).toContainEqual(
      expect.objectContaining({ hazard: 'context_reproduction_request', action: 'soften' }),
    );
    expect(generationDirectiveFor(decision)).toBe('no_reproduction');
  });

  it('limited tem precedência sobre no_reproduction', () => {
    const decision = decideInput({
      ...benignInput,
      contextReproductionRequest: 0.6,
      competenceBridge: 0.8,
    });
    expect(generationDirectiveFor(decision)).toBe('limited');
  });

  it('no_reproduction tem precedência sobre soften', () => {
    const decision = decideInput({
      ...benignInput,
      contextReproductionRequest: 0.6,
      formattingAnchor: 0.5,
    });
    expect(generationDirectiveFor(decision)).toBe('no_reproduction');
  });

  it('ignora despejo abaixo de 0,35', () => {
    const decision = decideInput({ ...benignInput, contextReproductionRequest: 0.34 });
    expect(decision.action).toBe('pass');
    expect(decision.signals.map(({ hazard }) => hazard)).not.toContain(
      'context_reproduction_request',
    );
  });

  it('responde parcialmente pedido misto confiante', () => {
    const decision = decideInput({
      ...benignInput,
      scope: 'partially_in_scope',
      scopeConfidence: 0.8,
    });
    expect(decision.action).toBe('limited');
    expect(generationDirectiveFor(decision)).toBe('limited');
  });

  it('limita ponte de competências forte e escala a incerta', () => {
    expect(decideInput({ ...benignInput, competenceBridge: 0.75 }).action).toBe('limited');
    expect(decideInput({ ...benignInput, careerFrameExternalTask: 0.5 }).action).toBe('fallback');
  });

  it('recusa pedido externo só quando também é grave', () => {
    expect(
      decideInput({ ...benignInput, externalContentRequest: 0.9, severity: 1 }).action,
    ).toBe('pass');
    expect(
      decideInput({ ...benignInput, externalContentRequest: 0.9, severity: 2.2 }).action,
    ).toBe('refuse');
  });

  it('recusa fora de escopo confiante e escala escopo incerto', () => {
    expect(decideInput({ ...benignInput, scope: 'out_of_scope' }).action).toBe('refuse');
    expect(decideInput({ ...benignInput, scopeConfidence: 0.5 }).action).toBe('fallback');
  });

  it('registra a regex só como sinal: quem decide é o Jev', () => {
    for (const hazard of [
      'formatting_anchor',
      'competence_bridge',
      'career_frame_solve',
      'context_reproduction',
    ] as const) {
      const decision = decideInput(benignInput, hazard);
      expect(decision.action).toBe('pass');
      expect(decision.signals).toContainEqual(
        expect.objectContaining({ hazard: `regex:${hazard}`, action: 'pass' }),
      );
      expect(generationDirectiveFor(decision)).toBeUndefined();
    }
    expect(
      decideInput({ ...benignInput, instructionOverride: 0.9 }, 'formatting_anchor').action,
    ).toBe('refuse');
  });

  it('preserva a diretiva do Jev mesmo quando a ação final é fallback', () => {
    const decision = decideInput({ ...benignInput, scopeConfidence: 0.4, competenceBridge: 0.8 });
    expect(decision.action).toBe('fallback');
    expect(generationDirectiveFor(decision)).toBe('limited');
  });
});

describe('decidePassages', () => {
  it('põe em quarentena só trechos com probabilidade alta', () => {
    const { quarantined, signals } = decidePassages([0.05, 0.9, 0.5]);
    expect(quarantined).toEqual([1]);
    expect(signals.map(({ hazard }) => hazard)).toEqual([
      'chunk_1_contains_instructions',
      'chunk_2_contains_instructions',
    ]);
  });
});

describe('decideGroundedness', () => {
  it('passa resposta totalmente suportada', () => {
    expect(decideGroundedness(supported).action).toBe('pass');
  });

  it('recusa conteúdo injetado ou conhecimento externo fortes', () => {
    expect(decideGroundedness({ ...supported, injectedContent: 0.85 }).action).toBe('refuse');
    expect(decideGroundedness({ ...supported, externalKnowledge: 0.75 }).action).toBe('refuse');
  });

  it('escala sinal Noul incerto para o verificador Groq', () => {
    expect(decideGroundedness({ ...supported, externalKnowledge: 0.5 }).action).toBe('fallback');
  });

  it('não escala por confidence baixa quando a massa está em Most/All (R2-3)', () => {
    const decision = decideGroundedness({
      ...supported,
      supportLevel: 2.56,
      supportConfidence: 0.56,
      supportProbabilities: [0.02, 0.06, 0.38, 0.54],
    });
    expect(decision.action).toBe('pass');
  });

  it('entrega com ressalva quando a massa suportada pende para Most', () => {
    const decision = decideGroundedness({
      ...supported,
      supportLevel: 2.25,
      supportConfidence: 0.6,
      supportProbabilities: [0.03, 0.07, 0.52, 0.38],
    });
    expect(decision.action).toBe('limited');
  });

  it('gradua pela massa de probabilidade', () => {
    const at = (supportProbabilities: [number, number, number, number], supportLevel: number) =>
      decideGroundedness({ ...supported, supportLevel, supportProbabilities }).action;
    expect(at([0.7, 0.2, 0.05, 0.05], 0.4)).toBe('refuse');
    expect(at([0.2, 0.65, 0.1, 0.05], 1)).toBe('fallback');
    expect(at([0.2, 0.25, 0.3, 0.25], 1.6)).toBe('fallback');
  });

  it('hazards Noul continuam dominando com massa suportada', () => {
    expect(decideGroundedness({ ...supported, injectedContent: 0.9 }).action).toBe('refuse');
    expect(decideGroundedness({ ...supported, externalKnowledge: 0.5 }).action).toBe('fallback');
  });

  it('"All" que contradiz o Noul de suporte total vira limited, não fallback', () => {
    expect(decideGroundedness({ ...supported, fullySupported: 0.2 }).action).toBe('limited');
  });

  it('o sinal support_level carrega as probabilidades e a confidence', () => {
    const decision = decideGroundedness(supported);
    expect(decision.signals).toContainEqual(
      expect.objectContaining({
        hazard: 'support_level',
        confidence: 0.88,
        probabilities: [0.01, 0.02, 0.07, 0.9],
      }),
    );
  });
});
