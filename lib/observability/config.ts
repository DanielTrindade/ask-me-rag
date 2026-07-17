import 'server-only';

const DEFAULT_IP_RETENTION_DAYS = 7;
const DEFAULT_CONVERSATION_RETENTION_DAYS = 30;
const DEFAULT_AUDIT_RETENTION_DAYS = 90;

function parsePositiveInteger(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

export function isChatObservabilityEnabled() {
  return process.env.CHAT_OBSERVABILITY_ENABLED === 'true';
}

export function getTrustedProxyHops(): number | null {
  const value = process.env.CHAT_TRUSTED_PROXY_HOPS;
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
}

export function getTelemetryRetention() {
  const ipDays = parsePositiveInteger(process.env.CHAT_IP_RETENTION_DAYS, DEFAULT_IP_RETENTION_DAYS, 30);
  const conversationDays = parsePositiveInteger(
    process.env.CHAT_CONVERSATION_RETENTION_DAYS,
    DEFAULT_CONVERSATION_RETENTION_DAYS,
    365,
  );
  const auditDays = parsePositiveInteger(
    process.env.CHAT_AUDIT_RETENTION_DAYS,
    DEFAULT_AUDIT_RETENTION_DAYS,
    730,
  );

  return { ipDays, conversationDays, auditDays };
}

