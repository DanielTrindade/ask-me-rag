import type { UIMessage } from 'ai';

export type SourceReference = {
  name: string;
  matchedChunks: number;
};

export type PublicChatFailureKind =
  | 'temporarily_limited'
  | 'temporarily_unavailable'
  | 'conversation_busy'
  | 'disabled';

export type PublicChatStatusKind =
  | PublicChatFailureKind
  | 'partial'
  | 'cache_hit'
  | 'deterministic_fallback';

export type PublicChatStatus = {
  kind: PublicChatStatusKind;
  retryable: boolean;
  resetAt?: string;
};

export type PublicChatFailureResponse = {
  error: PublicChatFailureKind;
  message: string;
  retryable: boolean;
  resetAt?: string;
};

export const SOURCE_DATA_PART_ID = 'retrieval-sources';
export const CHAT_STATUS_DATA_PART_ID = 'public-chat-status';
const PUBLIC_ERROR_PREFIX = 'ask-me-public-chat:';

const PUBLIC_FAILURES = new Set<PublicChatFailureKind>([
  'temporarily_limited',
  'temporarily_unavailable',
  'conversation_busy',
  'disabled',
]);

const PUBLIC_STATUSES = new Set<PublicChatStatusKind>([
  ...PUBLIC_FAILURES,
  'partial',
  'cache_hit',
  'deterministic_fallback',
]);

export type PortfolioUIMessage = UIMessage<
  unknown,
  {
    sources: {
      sources: SourceReference[];
    };
    'chat-status': PublicChatStatus;
  }
>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

export function isPublicChatFailureResponse(value: unknown): value is PublicChatFailureResponse {
  const candidate = record(value);
  return Boolean(
    candidate
      && typeof candidate.error === 'string'
      && PUBLIC_FAILURES.has(candidate.error as PublicChatFailureKind)
      && typeof candidate.message === 'string'
      && typeof candidate.retryable === 'boolean'
      && (candidate.resetAt === undefined || typeof candidate.resetAt === 'string'),
  );
}

export function isPublicChatStatus(value: unknown): value is PublicChatStatus {
  const candidate = record(value);
  return Boolean(
    candidate
      && typeof candidate.kind === 'string'
      && PUBLIC_STATUSES.has(candidate.kind as PublicChatStatusKind)
      && typeof candidate.retryable === 'boolean'
      && (candidate.resetAt === undefined || typeof candidate.resetAt === 'string'),
  );
}

export class PublicChatRequestError extends Error {
  readonly failure: PublicChatFailureResponse;
  readonly httpStatus: number;

  constructor(failure: PublicChatFailureResponse, httpStatus: number) {
    super(failure.error);
    this.name = 'PublicChatRequestError';
    this.failure = failure;
    this.httpStatus = httpStatus;
  }
}

export async function publicChatFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, init);
  if (response.ok) return response;

  try {
    const payload = await response.clone().json() as unknown;
    if (isPublicChatFailureResponse(payload)) {
      throw new PublicChatRequestError(payload, response.status);
    }
  } catch (error) {
    if (error instanceof PublicChatRequestError) throw error;
  }

  return response;
}

export function serializePublicChatStatus(status: PublicChatStatus) {
  return `${PUBLIC_ERROR_PREFIX}${JSON.stringify(status)}`;
}

export function parsePublicChatStatusMessage(message: string): PublicChatStatus | null {
  if (!message.startsWith(PUBLIC_ERROR_PREFIX)) return null;
  try {
    const value = JSON.parse(message.slice(PUBLIC_ERROR_PREFIX.length)) as unknown;
    return isPublicChatStatus(value) ? value : null;
  } catch {
    return null;
  }
}

export function createSourcesDataPart(sources: SourceReference[]) {
  return {
    type: 'data-sources' as const,
    id: SOURCE_DATA_PART_ID,
    data: { sources },
  };
}

export function createChatStatusDataPart(status: PublicChatStatus) {
  return {
    type: 'data-chat-status' as const,
    id: CHAT_STATUS_DATA_PART_ID,
    data: status,
  };
}
