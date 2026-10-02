import 'server-only';

import {
  GUARD_ACTION_PRECEDENCE,
  type GroundednessSignals,
  type GuardAction,
  type GuardDecision,
  type GuardSignal,
  type GuardStage,
  type InputSignals,
  type RegexHazard,
} from '@/lib/ai/jev/types';

/**
 * Fonte única dos thresholds. Valores provisórios (ponto de partida do cookbook
 * de guardrails: review 0,35 / action 0,70 / massa de suporte 0,80), a calibrar
 * com os dados do modo sombra. Qualquer mudança aqui muda comportamento: suba
 * `JEV_POLICY_VERSION`.
 */
export const JEV_POLICY_VERSION = 'jev-policy-2026-10-02';

export const JEV_THRESHOLDS = {
  /** Noul: abaixo disto o sinal é ignorado; entre isto e `action`, é incerto. */
  review: 0.35,
  action: 0.7,
  /** Choice/Score: abaixo disto a resposta não é confiável o bastante para agir. */
  confidence: 0.7,
  /**
   * Score `support_level`: massa de probabilidade (níveis aceitáveis 2+3, ou
   * inaceitáveis 0+1) a partir da qual a decisão é tomada. Confidence baixa
   * espalhada entre alternativas igualmente aceitáveis (Most vs All) não
   * invalida a decisão (R2-3).
   */
  supportMass: 0.8,
  systemPromptExtraction: 0.5,
  /** Score de gravidade (0..3) a partir do qual pedido externo é recusado. */
  severity: 2,
  /** Trecho recuperado com probabilidade de conter instruções acima disto vai para quarentena. */
  passageQuarantine: 0.7,
} as const;

function strongest(actions: readonly GuardAction[]): GuardAction {
  return actions.reduce<GuardAction>(
    (current, next) =>
      GUARD_ACTION_PRECEDENCE.indexOf(next) > GUARD_ACTION_PRECEDENCE.indexOf(current)
        ? next
        : current,
    'pass',
  );
}

function decide(signals: GuardSignal[]): GuardDecision {
  return { action: strongest(signals.map(({ action }) => action)), signals };
}

/**
 * Noul graduado: acima de `action` aplica a ação; na faixa incerta escala
 * para o caminho Groq atual. Noul não tem confidence: a própria
 * probabilidade perto de 0,5 é o sinal de incerteza.
 */
function graded(
  stage: GuardStage,
  hazard: string,
  probability: number,
  action: GuardAction,
): GuardSignal | null {
  if (probability >= JEV_THRESHOLDS.action) return { stage, hazard, value: probability, action };
  if (probability >= JEV_THRESHOLDS.review) {
    return { stage, hazard, value: probability, action: 'fallback' };
  }
  return null;
}

const HISTORY_INJECTION_HAZARD = 'history_instruction_injection';

export function decideInput(
  signals: InputSignals,
  regexHazard: RegexHazard | null = null,
): GuardDecision {
  const collected: GuardSignal[] = [];
  const push = (signal: GuardSignal | null) => {
    if (signal) collected.push(signal);
  };

  if (signals.systemPromptExtraction >= JEV_THRESHOLDS.systemPromptExtraction) {
    push({
      stage: 'input',
      hazard: 'system_prompt_extraction',
      value: signals.systemPromptExtraction,
      action: 'refuse',
    });
  }
  push(graded('input', 'instruction_override', signals.instructionOverride, 'refuse'));
  if (
    signals.externalContentRequest >= JEV_THRESHOLDS.action &&
    signals.severity >= JEV_THRESHOLDS.severity
  ) {
    push({
      stage: 'input',
      hazard: 'external_content_request',
      value: signals.externalContentRequest,
      action: 'refuse',
    });
  }
  push(graded('input', 'competence_bridge', signals.competenceBridge, 'limited'));
  push(graded('input', 'career_frame_external_task', signals.careerFrameExternalTask, 'limited'));
  if (signals.formattingAnchor >= JEV_THRESHOLDS.review) {
    push({
      stage: 'input',
      hazard: 'formatting_anchor',
      value: signals.formattingAnchor,
      action: 'soften',
    });
  }

  // R2-1: pedido para despejar os trechos recuperados. Não recusa a pergunta
  // (o pedido costuma vir junto de uma pergunta legítima): responde sem despejar.
  if (signals.contextReproductionRequest >= JEV_THRESHOLDS.review) {
    push({
      stage: 'input',
      hazard: 'context_reproduction_request',
      value: signals.contextReproductionRequest,
      action: 'soften',
    });
  }

  // R2-5: o histórico (client-authored) traz instruções falsas de "assistente".
  // Não recusa a pergunta do usuário: o sinal só faz a rota descartar o histórico.
  if (signals.historyInstructionInjection >= JEV_THRESHOLDS.review) {
    push({
      stage: 'input',
      hazard: HISTORY_INJECTION_HAZARD,
      value: signals.historyInstructionInjection,
      action: 'pass',
    });
  }

  const scopeAction: GuardAction =
    signals.scopeConfidence < JEV_THRESHOLDS.confidence
      ? 'fallback'
      : signals.scope === 'out_of_scope'
        ? 'refuse'
        : signals.scope === 'partially_in_scope'
          ? 'limited'
          : 'pass';
  push({
    stage: 'scope',
    hazard: 'scope',
    value: signals.scope,
    confidence: signals.scopeConfidence,
    action: scopeAction,
  });

  if (regexHazard) {
    // A heurística não veta nem impõe piso: fica registrada para comparar
    // regex × Jev na calibração. Quem decide é o julgamento semântico.
    push({ stage: 'input', hazard: `regex:${regexHazard}`, value: 1, action: 'pass' });
  }

  return decide(collected);
}

/**
 * Diretiva de geração derivada dos sinais do Jev, independente da ação final:
 * quando a decisão é `fallback` e o classificador Groq aprova, a diretiva
 * `limited`/`soften` ainda vale.
 */
export function generationDirectiveFor(
  decision: GuardDecision,
): 'limited' | 'no_reproduction' | 'soften' | undefined {
  const actions = new Set(decision.signals.map(({ action }) => action));
  if (actions.has('limited')) return 'limited';
  if (decision.signals.some(({ hazard }) => hazard === 'context_reproduction_request')) {
    return 'no_reproduction';
  }
  if (actions.has('soften')) return 'soften';
  return undefined;
}

/** R2-5: histórico envenenado; a geração usa só a pergunta atual. */
export function shouldDropClientHistory(decision: GuardDecision): boolean {
  return decision.signals.some(({ hazard }) => hazard === HISTORY_INJECTION_HAZARD);
}

export function decidePassages(probabilities: readonly number[]) {
  const quarantined: number[] = [];
  const signals: GuardSignal[] = [];
  probabilities.forEach((probability, index) => {
    if (probability < JEV_THRESHOLDS.review) return;
    const quarantine = probability >= JEV_THRESHOLDS.passageQuarantine;
    if (quarantine) quarantined.push(index);
    signals.push({
      stage: 'passage',
      hazard: `chunk_${index}_contains_instructions`,
      value: probability,
      // Trecho incerto fica no contexto: o prompt de geração já o trata como
      // dado não confiável, e a verificação de fundamentação vem depois.
      action: quarantine ? 'refuse' : 'pass',
    });
  });
  return { quarantined, signals };
}

export function decideGroundedness(signals: GroundednessSignals): GuardDecision {
  const collected: GuardSignal[] = [];
  const push = (signal: GuardSignal | null) => {
    if (signal) collected.push(signal);
  };

  push(graded('groundedness', 'injected_content', signals.injectedContent, 'refuse'));
  push(graded('groundedness', 'external_knowledge', signals.externalKnowledge, 'refuse'));

  // R2-3: decide pela massa de probabilidade, não pela confidence. Antes,
  // confidence < 0,7 com suporte entre Most e All (16 de 24 decisões em
  // produção) caía em `fallback` e o verificador Groq, não determinístico,
  // recusava ao acaso. Confidence é reportada no sinal, mas não decide.
  const [p0, p1, p2, p3] = signals.supportProbabilities;
  const supportedMass = p2 + p3;
  const unsupportedMass = p0 + p1;
  let supportAction: GuardAction;
  if (supportedMass >= JEV_THRESHOLDS.supportMass) {
    // "All" mas o Noul discorda não escala mais: a massa está em níveis
    // aceitáveis, então entrega com ressalva (`limited`) em vez de `fallback`.
    supportAction =
      signals.supportLevel >= 2.5 && signals.fullySupported >= JEV_THRESHOLDS.review
        ? 'pass'
        : 'limited';
  } else if (unsupportedMass >= JEV_THRESHOLDS.supportMass) {
    // Minoria suportada (Some) não entrega com ressalva: devolve ao verificador Groq.
    supportAction = p0 >= p1 ? 'refuse' : 'fallback';
  } else {
    // Incerteza genuína entre suportado e não suportado: o verificador Groq é o backstop.
    supportAction = 'fallback';
  }
  push({
    stage: 'groundedness',
    hazard: 'support_level',
    value: signals.supportLevel,
    confidence: signals.supportConfidence,
    probabilities: signals.supportProbabilities,
    action: supportAction,
  });

  return decide(collected);
}
