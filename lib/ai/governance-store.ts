import 'server-only';

import { getServiceClient } from '@/lib/supabase';

export type AdmissionDecision =
  | 'allowed'
  | 'duplicate'
  | 'visitor_limited'
  | 'global_limited'
  | 'conversation_busy'
  | 'disabled';

export type ReservationStatus =
  | 'reserved'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'timed_out'
  | 'denied';

export interface ReserveChatGenerationInput {
  requestId: string;
  conversationId: string;
  messageId: string;
  visitorKey: string | null;
  disabled: boolean;
  visitorPerMinuteLimit: number;
  visitorDailyLimit: number;
  globalDailyLimit: number;
  operationalReserveDaily: number;
  resetTimeZone: string;
  conversationLeaseTtlSeconds: number;
}

export interface ReservationResult {
  decision: AdmissionDecision;
  requestId: string;
  originalDecision?: Exclude<AdmissionDecision, 'duplicate'>;
  status?: ReservationStatus;
  leaseExpiresAt?: string;
  resetAt?: string;
}

export class GovernanceStoreError extends Error {
  constructor(readonly operation: 'reserve' | 'finalize' | 'budget') {
    super(`Governance store unavailable: ${operation}`);
    this.name = 'GovernanceStoreError';
  }
}

const DECISIONS = new Set<AdmissionDecision>([
  'allowed',
  'duplicate',
  'visitor_limited',
  'global_limited',
  'conversation_busy',
  'disabled',
]);

function parseReservationResult(value: unknown): ReservationResult {
  if (!value || typeof value !== 'object') throw new GovernanceStoreError('reserve');
  const result = value as Record<string, unknown>;
  if (
    typeof result.decision !== 'string' ||
    !DECISIONS.has(result.decision as AdmissionDecision) ||
    typeof result.requestId !== 'string'
  ) {
    throw new GovernanceStoreError('reserve');
  }
  return {
    decision: result.decision as AdmissionDecision,
    requestId: result.requestId,
    originalDecision:
      typeof result.originalDecision === 'string'
        ? (result.originalDecision as ReservationResult['originalDecision'])
        : undefined,
    status:
      typeof result.status === 'string' ? (result.status as ReservationStatus) : undefined,
    leaseExpiresAt:
      typeof result.leaseExpiresAt === 'string' ? result.leaseExpiresAt : undefined,
    resetAt: typeof result.resetAt === 'string' ? result.resetAt : undefined,
  };
}

export async function reserveChatGeneration(
  input: ReserveChatGenerationInput,
): Promise<ReservationResult> {
  try {
    const { data, error } = await getServiceClient().rpc('reserve_chat_generation', {
      p_request_id: input.requestId,
      p_conversation_id: input.conversationId,
      p_message_id: input.messageId,
      p_visitor_key: input.visitorKey,
      p_disabled: input.disabled,
      p_visitor_minute_limit: input.visitorPerMinuteLimit,
      p_visitor_daily_limit: input.visitorDailyLimit,
      p_global_daily_limit: input.globalDailyLimit,
      p_operational_reserve: input.operationalReserveDaily,
      p_reset_time_zone: input.resetTimeZone,
      p_lease_ttl_seconds: input.conversationLeaseTtlSeconds,
    });
    if (error) throw error;
    const result = parseReservationResult(data);
    if (result.decision === 'allowed') {
      try {
        const { error: alertError } = await getServiceClient().rpc(
          'record_chat_usage_thresholds',
          { p_limit: input.globalDailyLimit - input.operationalReserveDaily },
        );
        if (alertError) throw alertError;
      } catch {
        console.warn('[chat-governance] threshold_event_failed', {
          category: 'store_unavailable',
        });
      }
    }
    return result;
  } catch (error) {
    if (error instanceof GovernanceStoreError) throw error;
    throw new GovernanceStoreError('reserve');
  }
}

export async function finalizeChatGeneration(
  requestId: string,
  status: 'completed' | 'failed' | 'aborted' | 'timed_out',
) {
  try {
    const { data, error } = await getServiceClient().rpc('finalize_chat_generation', {
      p_request_id: requestId,
      p_status: status,
    });
    if (error || data !== true) throw error ?? new Error('invalid_finalize_result');
  } catch {
    throw new GovernanceStoreError('finalize');
  }
}

export async function readChatDailyBudget(input: {
  visitorKey: string | null;
  resetTimeZone: string;
  globalDailyLimit: number;
  operationalReserveDaily: number;
}) {
  try {
    const { data, error } = await getServiceClient().rpc('read_chat_daily_budget', {
      p_visitor_key: input.visitorKey,
      p_reset_time_zone: input.resetTimeZone,
      p_global_daily_limit: input.globalDailyLimit,
      p_operational_reserve: input.operationalReserveDaily,
    });
    if (error || !data || typeof data !== 'object') throw error ?? new Error('invalid_budget');
    return data as {
      globalUsed: number;
      globalLimit: number;
      visitorUsed: number | null;
      resetAt: string;
    };
  } catch {
    throw new GovernanceStoreError('budget');
  }
}
