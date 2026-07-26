import 'server-only';

import { parseChatUsageConfig, type ChatUsageConfig } from '@/lib/ai/governance-config';
import {
  finalizeChatGeneration,
  reserveChatGeneration,
  type AdmissionDecision,
  type ReservationResult,
  type ReserveChatGenerationInput,
} from '@/lib/ai/governance-store';

export type EffectiveAdmissionDecision =
  | AdmissionDecision
  | 'off'
  | 'emergency_bypass'
  | 'governance_unavailable';

export interface ChatAdmissionRequest {
  requestId: string;
  conversationId: string;
  messageId: string;
  visitorKey: string | null;
}

export interface ChatAdmissionResult {
  allowed: boolean;
  decision: EffectiveAdmissionDecision;
  observedDecision?: AdmissionDecision | 'governance_unavailable';
  reservationRequestId?: string;
  shouldFinalize: boolean;
  resetAt?: string;
}

interface AdmissionDependencies {
  config?: ChatUsageConfig;
  reserve?: (input: ReserveChatGenerationInput) => Promise<ReservationResult>;
}

const ALWAYS_ENFORCED = new Set<AdmissionDecision>([
  'duplicate',
  'conversation_busy',
  'disabled',
]);

export async function admitChatRequest(
  input: ChatAdmissionRequest,
  dependencies: AdmissionDependencies = {},
): Promise<ChatAdmissionResult> {
  const config = dependencies.config ?? parseChatUsageConfig();
  const reserve = dependencies.reserve ?? reserveChatGeneration;

  if (config.governance.mode === 'off') {
    return config.governance.killSwitch
      ? { allowed: false, decision: 'disabled', shouldFinalize: false }
      : { allowed: true, decision: 'off', shouldFinalize: false };
  }

  let reservation: ReservationResult;
  try {
    reservation = await reserve({
      ...input,
      disabled: config.governance.killSwitch,
      visitorPerMinuteLimit: config.governance.visitorPerMinuteLimit,
      visitorDailyLimit: config.governance.visitorDailyLimit,
      globalDailyLimit: config.governance.globalDailyLimit,
      operationalReserveDaily: config.governance.operationalReserveDaily,
      resetTimeZone: config.governance.resetTimeZone,
      conversationLeaseTtlSeconds: config.governance.conversationLeaseTtlSeconds,
    });
  } catch {
    if (config.governance.killSwitch) {
      return { allowed: false, decision: 'disabled', shouldFinalize: false };
    }
    if (config.rollout.emergencyBypass) {
      return {
        allowed: true,
        decision: 'emergency_bypass',
        observedDecision: 'governance_unavailable',
        shouldFinalize: false,
      };
    }
    return { allowed: false, decision: 'governance_unavailable', shouldFinalize: false };
  }

  if (reservation.decision === 'allowed') {
    return {
      allowed: true,
      decision: 'allowed',
      reservationRequestId: reservation.requestId,
      shouldFinalize: true,
      resetAt: reservation.resetAt,
    };
  }

  if (
    config.governance.mode === 'shadow' &&
    !ALWAYS_ENFORCED.has(reservation.decision)
  ) {
    return {
      allowed: true,
      decision: 'off',
      observedDecision: reservation.decision,
      shouldFinalize: false,
      resetAt: reservation.resetAt,
    };
  }

  if (config.rollout.emergencyBypass && !ALWAYS_ENFORCED.has(reservation.decision)) {
    return {
      allowed: true,
      decision: 'emergency_bypass',
      observedDecision: reservation.decision,
      shouldFinalize: false,
      resetAt: reservation.resetAt,
    };
  }

  return {
    allowed: false,
    decision: reservation.decision,
    reservationRequestId: reservation.requestId,
    shouldFinalize: false,
    resetAt: reservation.resetAt,
  };
}

export async function finishGovernedRequest(
  admission: ChatAdmissionResult,
  status: 'completed' | 'failed' | 'aborted' | 'timed_out',
) {
  if (!admission.shouldFinalize || !admission.reservationRequestId) return true;
  try {
    await finalizeChatGeneration(admission.reservationRequestId, status);
    return true;
  } catch {
    console.warn('[chat-governance] finalize_failed', { category: 'store_unavailable' });
    return false;
  }
}
