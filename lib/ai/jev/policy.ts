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
 * de guardrails: review 0,35 / action 0,70), a calibrar com os dados do modo
 * sombra. Qualquer mudança aqui muda comportamento: suba `JEV_POLICY_VERSION`.
 */
export const JEV_POLICY_VERSION = 'jev-policy-2026-09-25';

export const JEV_THRESHOLDS = {
  /** Noul: abaixo disto o sinal é ignorado; entre isto e `action`, é incerto. */
  review: 0.35,
  action: 0.7,
  /** Choice/Score: abaixo disto a resposta não é confiável o bastante para agir. */
  confidence: 0.7,
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
export function generationDirectiveFor(decision: GuardDecision): 'limited' | 'soften' | undefined {
  const actions = new Set(decision.signals.map(({ action }) => action));
  if (actions.has('limited')) return 'limited';
  if (actions.has('soften')) return 'soften';
  return undefined;
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

  const level = Math.round(signals.supportLevel);
  let supportAction: GuardAction;
  if (signals.supportConfidence < JEV_THRESHOLDS.confidence) supportAction = 'fallback';
  else if (level <= 0) supportAction = 'refuse';
  // Minoria suportada: não entrega com ressalva, devolve ao verificador Groq.
  else if (level === 1) supportAction = 'fallback';
  else if (level === 2) supportAction = 'limited';
  // "All" mas o Noul discorda: incoerência entre perguntas, escala.
  else if (signals.fullySupported < JEV_THRESHOLDS.review) supportAction = 'fallback';
  else supportAction = 'pass';
  push({
    stage: 'groundedness',
    hazard: 'support_level',
    value: signals.supportLevel,
    confidence: signals.supportConfidence,
    action: supportAction,
  });

  return decide(collected);
}
