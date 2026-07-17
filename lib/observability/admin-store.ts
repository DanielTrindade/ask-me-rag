import 'server-only';

import { decryptIp } from '@/lib/observability/ip-crypto';
import { maskIp } from '@/lib/observability/network';
import { getServiceClient } from '@/lib/supabase';

export interface ConversationFilters {
  from: string;
  to: string;
  limit: number;
  cursorAt?: string;
  cursorId?: string;
  status?: 'running' | 'completed' | 'failed' | 'aborted';
  deviceType?: string;
  browserName?: string;
  isBot?: boolean;
  ipHash?: string;
  query?: string;
}

interface ConversationRow {
  id: string;
  started_at: string;
  last_activity_at: string;
  device_type: string;
  is_bot: boolean;
  os_name: string;
  os_major: string;
  browser_name: string;
  browser_major: string;
  preferred_language: string;
  ip_available: boolean;
  message_count: number;
  request_count: number;
  last_status: string | null;
}

function maskedEnvelope(envelope: string | null | undefined) {
  if (!envelope) return 'unknown';
  try {
    return maskIp(decryptIp(envelope));
  } catch {
    return 'unknown';
  }
}

async function loadMaskedIps(ids: string[]) {
  const values = new Map<string, string>();
  if (ids.length === 0) return values;
  const { data, error } = await getServiceClient()
    .from('chat_conversations')
    .select('id, ip_encrypted')
    .in('id', ids);
  if (error) throw error;
  for (const row of data ?? []) {
    values.set(String(row.id), maskedEnvelope(row.ip_encrypted));
  }
  return values;
}

export async function getObservabilitySummary(from: string, to: string) {
  const { data, error } = await getServiceClient().rpc('chat_observability_summary', {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data;
}

export async function listObservabilityConversations(filters: ConversationFilters) {
  const { data, error } = await getServiceClient().rpc('list_chat_conversations', {
    p_from: filters.from,
    p_to: filters.to,
    p_limit: filters.limit + 1,
    p_cursor_at: filters.cursorAt ?? null,
    p_cursor_id: filters.cursorId ?? null,
    p_status: filters.status ?? null,
    p_device_type: filters.deviceType ?? null,
    p_browser_name: filters.browserName ?? null,
    p_is_bot: filters.isBot ?? null,
    p_ip_hash: filters.ipHash ?? null,
    p_query: filters.query ?? null,
  });
  if (error) throw error;

  const rows = (data ?? []) as ConversationRow[];
  const hasMore = rows.length > filters.limit;
  const page = rows.slice(0, filters.limit);
  const maskedIps = await loadMaskedIps(page.map((row) => row.id));
  return {
    conversations: page.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      lastActivityAt: row.last_activity_at,
      deviceType: row.device_type,
      isBot: row.is_bot,
      osName: row.os_name,
      osMajor: row.os_major,
      browserName: row.browser_name,
      browserMajor: row.browser_major,
      preferredLanguage: row.preferred_language,
      ipAvailable: row.ip_available,
      maskedIp: maskedIps.get(row.id) ?? 'unknown',
      messageCount: Number(row.message_count),
      requestCount: Number(row.request_count),
      lastStatus: row.last_status,
    })),
    hasMore,
  };
}

export async function getObservabilityConversation(id: string) {
  const supabase = getServiceClient();
  const [{ data, error }, { data: ipRow, error: ipError }] = await Promise.all([
    supabase.rpc('get_chat_conversation', { p_conversation_id: id }),
    supabase.from('chat_conversations').select('ip_encrypted').eq('id', id).maybeSingle(),
  ]);
  if (error) throw error;
  if (ipError) throw ipError;
  if (!data) return null;
  return {
    ...(data as Record<string, unknown>),
    maskedIp: maskedEnvelope(ipRow?.ip_encrypted),
  };
}

export async function auditTelemetryAction(
  action: string,
  conversationId: string,
  outcome: string,
) {
  const { error } = await getServiceClient().rpc('record_chat_telemetry_audit', {
    p_action: action,
    p_target_conversation_id: conversationId,
    p_outcome: outcome,
    p_session_id: 'shared-admin-session',
  });
  if (error) throw error;
}

export async function revealConversationIp(id: string) {
  const { data, error } = await getServiceClient()
    .from('chat_conversations')
    .select('ip_encrypted')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.ip_encrypted) return null;
  return decryptIp(data.ip_encrypted);
}

export async function deleteObservabilityConversation(id: string) {
  const { data, error } = await getServiceClient().rpc('delete_chat_conversation', {
    p_conversation_id: id,
  });
  if (error) throw error;
  return Boolean(data);
}
