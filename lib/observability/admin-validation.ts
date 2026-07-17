import 'server-only';

import { hashIp } from '@/lib/observability/ip-crypto';
import { normalizeIp } from '@/lib/observability/network';
import { isUuid } from '@/lib/uuid';
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1_000;
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1_000;

export class AdminObservabilityValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AdminObservabilityValidationError';
  }
}

export function assertConversationId(value: string) {
  if (!isUuid(value)) {
    throw new AdminObservabilityValidationError('invalid_conversation_id');
  }
  return value;
}

export function parseDateRange(searchParams: URLSearchParams, now = new Date()) {
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : now;
  const from = searchParams.get('from')
    ? new Date(searchParams.get('from')!)
    : new Date(to.getTime() - DEFAULT_RANGE_MS);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > MAX_RANGE_MS
  ) {
    throw new AdminObservabilityValidationError('invalid_date_range');
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function parseConversationFilters(searchParams: URLSearchParams) {
  const range = parseDateRange(searchParams);
  const limitValue = Number(searchParams.get('limit') ?? '25');
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
    throw new AdminObservabilityValidationError('invalid_limit');
  }

  const statusValue = searchParams.get('status');
  const statuses = ['running', 'completed', 'failed', 'aborted'] as const;
  const status = statuses.find((candidate) => candidate === statusValue);
  if (statusValue && !status) {
    throw new AdminObservabilityValidationError('invalid_status');
  }

  const botValue = searchParams.get('bot');
  if (botValue && botValue !== 'true' && botValue !== 'false') {
    throw new AdminObservabilityValidationError('invalid_bot_filter');
  }

  const cursorValue = searchParams.get('cursor');
  let cursorAt: string | undefined;
  let cursorId: string | undefined;
  if (cursorValue) {
    try {
      const parsed = JSON.parse(Buffer.from(cursorValue, 'base64url').toString('utf8')) as {
        at?: unknown;
        id?: unknown;
      };
      if (
        typeof parsed.at !== 'string' ||
        Number.isNaN(new Date(parsed.at).getTime()) ||
        typeof parsed.id !== 'string'
      ) {
        throw new Error('invalid');
      }
      cursorAt = new Date(parsed.at).toISOString();
      cursorId = assertConversationId(parsed.id);
    } catch {
      throw new AdminObservabilityValidationError('invalid_cursor');
    }
  }

  const bounded = (name: string, max: number) => {
    const value = searchParams.get(name)?.trim();
    if (!value) return undefined;
    if (value.length > max) throw new AdminObservabilityValidationError(`invalid_${name}`);
    return value;
  };

  const rawIp = bounded('ip', 45);
  const normalizedIp = rawIp ? normalizeIp(rawIp) : null;
  if (rawIp && !normalizedIp) throw new AdminObservabilityValidationError('invalid_ip');

  const query = bounded('query', 200);
  if (searchParams.has('query') && !query) {
    throw new AdminObservabilityValidationError('invalid_query');
  }

  return {
    ...range,
    limit: limitValue,
    cursorAt,
    cursorId,
    status,
    deviceType: bounded('device', 40),
    browserName: bounded('browser', 80),
    isBot: botValue ? botValue === 'true' : undefined,
    ipHash: normalizedIp ? hashIp(normalizedIp) : undefined,
    query,
  };
}

export function encodeConversationCursor(lastActivityAt: string, id: string) {
  return Buffer.from(JSON.stringify({ at: lastActivityAt, id })).toString('base64url');
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
