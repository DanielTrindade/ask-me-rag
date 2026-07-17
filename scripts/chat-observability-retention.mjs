import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const DEFAULTS = { ipDays: 7, conversationDays: 30, auditDays: 90 };

function positiveInteger(value, fallback, max) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error('invalid_retention_configuration');
  }
  return parsed;
}

/** @param {Record<string, string | undefined>} [env] */
export function readRetentionConfig(env = process.env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('missing_supabase_credentials');
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY,
    ipDays: positiveInteger(env.CHAT_IP_RETENTION_DAYS, DEFAULTS.ipDays, 30),
    conversationDays: positiveInteger(
      env.CHAT_CONVERSATION_RETENTION_DAYS,
      DEFAULTS.conversationDays,
      365,
    ),
    auditDays: positiveInteger(env.CHAT_AUDIT_RETENTION_DAYS, DEFAULTS.auditDays, 730),
  };
}

/** @param {{ env?: Record<string, string | undefined>, create?: (url: string, key: string, options: object) => { rpc: (name: string, args: object) => Promise<{ data: any, error: any }> } }} [options] */
export async function runRetention({ env = process.env, create = createClient } = {}) {
  const config = readRetentionConfig(env);
  const startedAt = performance.now();
  const client = create(config.url, config.key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc('purge_chat_telemetry', {
    p_ip_days: config.ipDays,
    p_conversation_days: config.conversationDays,
    p_audit_days: config.auditDays,
  });
  if (error) throw new Error('retention_database_failed');
  const counts = {
    encryptedIpsRemoved: Number(data?.encryptedIpsRemoved ?? 0),
    conversationsRemoved: Number(data?.conversationsRemoved ?? 0),
    auditsRemoved: Number(data?.auditsRemoved ?? 0),
  };
  console.log(JSON.stringify({
    event: 'chat_observability_retention_completed',
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...counts,
  }));
  return counts;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runRetention().catch((error) => {
    console.error(JSON.stringify({
      event: 'chat_observability_retention_failed',
      category: error instanceof Error ? error.message : 'unknown_error',
    }));
    process.exitCode = 1;
  });
}
