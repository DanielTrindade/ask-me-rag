import { hasAdminSession } from '@/lib/admin-session';
import { listObservabilityConversations } from '@/lib/observability/admin-store';
import {
  AdminObservabilityValidationError,
  encodeConversationCursor,
  parseConversationFilters,
} from '@/lib/observability/admin-validation';

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const filters = parseConversationFilters(new URL(request.url).searchParams);
    const result = await listObservabilityConversations(filters);
    const last = result.conversations.at(-1);
    const nextCursor =
      result.hasMore && last
        ? encodeConversationCursor(last.lastActivityAt, last.id)
        : null;
    return Response.json(
      { conversations: result.conversations, nextCursor },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof AdminObservabilityValidationError) {
      return Response.json(
        { error: 'invalid_request', category: error.code },
        { status: 400 },
      );
    }
    console.error('[/api/admin/observability/conversations] query_failed');
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
