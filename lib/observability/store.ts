import 'server-only';

import type { SourceReference } from '@/lib/chat-types';
import { getServiceClient } from '@/lib/supabase';

export type ChatRequestStatus = 'completed' | 'failed' | 'aborted';

export interface BeginChatTelemetryInput {
  requestId: string;
  conversationId: string;
  userMessageId: string;
  userContent: string;
  ipHash: string | null;
  ipEncrypted: string | null;
  deviceType: string;
  isBot: boolean;
  osName: string;
  osMajor: string;
  browserName: string;
  browserMajor: string;
  preferredLanguage: string;
  traceId: string;
}

export interface FinishChatTelemetryInput {
  requestId: string;
  status: ChatRequestStatus;
  assistantMessageId?: string;
  assistantContent?: string;
  messageStatus?: 'complete' | 'partial';
  sources?: SourceReference[];
  durationMs: number;
  provider?: string;
  model?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  errorCategory?: string;
}

function safeCategory(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (/^[A-Za-z0-9_-]{1,64}$/.test(code)) return code;
  }
  return error instanceof Error && /^[A-Za-z0-9_-]{1,64}$/.test(error.name)
    ? error.name
    : 'unknown_error';
}

export async function beginChatTelemetry(input: BeginChatTelemetryInput) {
  const startedAt = performance.now();
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('begin_chat_request', {
      p_request_id: input.requestId,
      p_conversation_id: input.conversationId,
      p_user_message_id: input.userMessageId,
      p_user_content: input.userContent,
      p_ip_hash: input.ipHash,
      p_ip_encrypted: input.ipEncrypted,
      p_device_type: input.deviceType,
      p_is_bot: input.isBot,
      p_os_name: input.osName,
      p_os_major: input.osMajor,
      p_browser_name: input.browserName,
      p_browser_major: input.browserMajor,
      p_preferred_language: input.preferredLanguage,
      p_trace_id: input.traceId,
      p_telemetry_write_ms: null,
    });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('invalid_begin_result');

    const writeMs = Math.max(0, Math.round(performance.now() - startedAt));
    try {
      const { error: metricError } = await supabase.rpc('record_chat_telemetry_write_ms', {
        p_request_id: data,
        p_telemetry_write_ms: writeMs,
      });
      if (metricError) throw metricError;
    } catch (error) {
      console.warn('[chat-observability] begin_metric_failed', {
        category: safeCategory(error),
      });
    }

    return data;
  } catch (error) {
    console.warn('[chat-observability] begin_failed', { category: safeCategory(error) });
    return null;
  }
}

export async function finishChatTelemetry(input: FinishChatTelemetryInput) {
  try {
    const { error } = await getServiceClient().rpc('finish_chat_request', {
      p_request_id: input.requestId,
      p_status: input.status,
      p_assistant_message_id: input.assistantMessageId ?? null,
      p_assistant_content: input.assistantContent ?? null,
      p_message_status: input.messageStatus ?? 'complete',
      p_sources: input.sources ?? [],
      p_duration_ms: input.durationMs,
      p_provider: input.provider ?? null,
      p_model: input.model ?? null,
      p_finish_reason: input.finishReason ?? null,
      p_input_tokens: input.inputTokens ?? null,
      p_output_tokens: input.outputTokens ?? null,
      p_total_tokens: input.totalTokens ?? null,
      p_error_category: input.errorCategory ?? null,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('[chat-observability] finish_failed', { category: safeCategory(error) });
    return false;
  }
}
