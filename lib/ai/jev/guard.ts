import 'server-only';

import type { ChatUsageConfig } from '@/lib/ai/governance-config';
import { isJevConfigured, type JevFailureCategory } from '@/lib/ai/jev/client';
import { askGroundednessGuard, toGroundednessSignals } from '@/lib/ai/jev/groundedness';
import { askInputGuard, toInputSignals } from '@/lib/ai/jev/input-guard';
import { askPassageGuard } from '@/lib/ai/jev/passage-guard';
import {
  decideGroundedness,
  decideInput,
  decidePassages,
  JEV_POLICY_VERSION,
} from '@/lib/ai/jev/policy';
import type {
  GuardDecision,
  GuardSignal,
  GuardStageMode,
  RegexHazard,
} from '@/lib/ai/jev/types';
import type { ScopeTurn } from '@/lib/ai/scope-guard';

export type JevModes = {
  input: GuardStageMode;
  passage: GuardStageMode;
  groundedness: GuardStageMode;
};

/**
 * Sombra sobrepõe as flags por estágio: com `CHAT_JEV_SHADOW=true` os três
 * estágios rodam e só registram. Sem chave da TypeSafe tudo fica desligado.
 */
export function resolveJevModes(
  config: ChatUsageConfig['jev'],
  configured = isJevConfigured(),
): JevModes {
  const mode = (enabled: boolean): GuardStageMode =>
    !configured ? 'off' : config.shadow ? 'shadow' : enabled ? 'active' : 'off';
  return {
    input: mode(config.inputGuardEnabled),
    passage: mode(config.passageGuardEnabled),
    groundedness: mode(config.groundednessEnabled),
  };
}

export function activeJevStages(modes: JevModes) {
  return (Object.keys(modes) as (keyof JevModes)[]).filter((stage) => modes[stage] === 'active');
}

type GuardLogEntry = {
  requestId: string;
  stage: keyof JevModes;
  mode: GuardStageMode;
  outcome: 'decided' | 'failed';
  action?: string;
  signals?: GuardSignal[];
  failure?: JevFailureCategory;
  model?: string;
  inputTokens?: number;
  costUsd?: number;
  durationMs: number;
};

/**
 * Telemetria via log estruturado (Cloud Logging). Só sinais e probabilidades:
 * o conteúdo da conversa já é armazenado pela observabilidade atual.
 */
export function logGuard(entry: GuardLogEntry) {
  console.info('[chat-guard]', JSON.stringify({ policyVersion: JEV_POLICY_VERSION, ...entry }));
}

export type StageOutcome<T> =
  | ({ ok: true } & T)
  | { ok: false; failure: JevFailureCategory };

export async function runInputGuard(input: {
  requestId: string;
  mode: GuardStageMode;
  question: string;
  recentTurns: ScopeTurn[];
  regexHazard: RegexHazard | null;
}): Promise<StageOutcome<{ decision: GuardDecision }>> {
  const result = await askInputGuard(input);
  if (!result.ok) {
    logGuard({
      requestId: input.requestId,
      stage: 'input',
      mode: input.mode,
      outcome: 'failed',
      failure: result.category,
      durationMs: result.durationMs,
    });
    return { ok: false, failure: result.category };
  }
  const decision = decideInput(toInputSignals(result.answers), input.regexHazard);
  logGuard({
    requestId: input.requestId,
    stage: 'input',
    mode: input.mode,
    outcome: 'decided',
    action: decision.action,
    signals: decision.signals,
    model: result.model,
    inputTokens: result.inputTokens,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  });
  return { ok: true, decision };
}

export async function runPassageGuard(input: {
  requestId: string;
  mode: GuardStageMode;
  chunks: readonly string[];
}): Promise<StageOutcome<{ quarantined: number[] }>> {
  if (input.chunks.length === 0) return { ok: true, quarantined: [] };
  const result = await askPassageGuard(input.chunks);
  if (!result.ok) {
    logGuard({
      requestId: input.requestId,
      stage: 'passage',
      mode: input.mode,
      outcome: 'failed',
      failure: result.category,
      durationMs: result.durationMs,
    });
    return { ok: false, failure: result.category };
  }
  const { quarantined, signals } = decidePassages(result.probabilities);
  logGuard({
    requestId: input.requestId,
    stage: 'passage',
    mode: input.mode,
    outcome: 'decided',
    action: quarantined.length > 0 ? 'quarantine' : 'pass',
    signals,
    model: result.model,
    inputTokens: result.inputTokens,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  });
  return { ok: true, quarantined };
}

export async function runGroundednessGuard(input: {
  requestId: string;
  mode: GuardStageMode;
  question: string;
  context: string;
  answer: string;
}): Promise<StageOutcome<{ decision: GuardDecision }>> {
  const result = await askGroundednessGuard(input);
  if (!result.ok) {
    logGuard({
      requestId: input.requestId,
      stage: 'groundedness',
      mode: input.mode,
      outcome: 'failed',
      failure: result.category,
      durationMs: result.durationMs,
    });
    return { ok: false, failure: result.category };
  }
  const decision = decideGroundedness(toGroundednessSignals(result.answers));
  logGuard({
    requestId: input.requestId,
    stage: 'groundedness',
    mode: input.mode,
    outcome: 'decided',
    action: decision.action,
    signals: decision.signals,
    model: result.model,
    inputTokens: result.inputTokens,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  });
  return { ok: true, decision };
}
