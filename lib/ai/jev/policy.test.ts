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
    for (const hazard of ['formatting_anchor', 'competence_bridge', 'career_frame_solve'] as const) {
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

  it('escala sinais incertos e baixa confiança para o verificador Groq', () => {
    expect(decideGroundedness({ ...supported, externalKnowledge: 0.5 }).action).toBe('fallback');
    expect(decideGroundedness({ ...supported, supportConfidence: 0.5 }).action).toBe('fallback');
  });

  it('gradua pelo nível de suporte', () => {
    expect(decideGroundedness({ ...supported, supportLevel: 0.2 }).action).toBe('refuse');
    expect(decideGroundedness({ ...supported, supportLevel: 1.1 }).action).toBe('fallback');
    expect(decideGroundedness({ ...supported, supportLevel: 2.1 }).action).toBe('limited');
  });

  it('escala quando "All" contradiz o Noul de suporte total', () => {
    expect(decideGroundedness({ ...supported, fullySupported: 0.2 }).action).toBe('fallback');
  });
});
