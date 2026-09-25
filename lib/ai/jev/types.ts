export type GuardAction = 'pass' | 'soften' | 'limited' | 'refuse' | 'fallback';

export type GuardStage = 'input' | 'scope' | 'passage' | 'groundedness';

export type GuardStageMode = 'off' | 'shadow' | 'active';

export type GuardSignal = {
  stage: GuardStage;
  hazard: string;
  /** Probabilidade de "sim" de um Noul, ou valor esperado de um Score. */
  value: number | string;
  /** Só Choice e Score trazem confidence; Noul não. */
  confidence?: number;
  action: GuardAction;
};

export type GuardDecision = {
  action: GuardAction;
  signals: GuardSignal[];
};

/** Precedência: refuse > fallback > limited > soften > pass. */
export const GUARD_ACTION_PRECEDENCE: readonly GuardAction[] = [
  'pass',
  'soften',
  'limited',
  'fallback',
  'refuse',
];

export type ScopeChoice = 'in_scope' | 'partially_in_scope' | 'out_of_scope';

export type InputSignals = {
  instructionOverride: number;
  formattingAnchor: number;
  competenceBridge: number;
  careerFrameExternalTask: number;
  systemPromptExtraction: number;
  externalContentRequest: number;
  /** Valor esperado de 0 (sem dano) a 3 (severo). */
  severity: number;
  scope: ScopeChoice;
  scopeConfidence: number;
};

export type GroundednessSignals = {
  fullySupported: number;
  injectedContent: number;
  externalKnowledge: number;
  /** Valor esperado de 0 (nada suportado) a 3 (tudo suportado). */
  supportLevel: number;
  supportConfidence: number;
};

export type RegexHazard = 'formatting_anchor' | 'competence_bridge' | 'career_frame_solve';
