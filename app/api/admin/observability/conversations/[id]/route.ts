import { hasAdminSession } from '@/lib/admin-session';
import {
  auditTelemetryAction,
  deleteObservabilityConversation,
  getObservabilityConversation,
} from '@/lib/observability/admin-store';
import {
  AdminObservabilityValidationError,
  assertConversationId,
  isSameOrigin,
} from '@/lib/observability/admin-validation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = assertConversationId((await context.params).id);
    const detail = await getObservabilityConversation(id);
    if (!detail) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AdminObservabilityValidationError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    console.error('[/api/admin/observability/conversations/:id] query_failed');
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = assertConversationId((await context.params).id);
    if (!isSameOrigin(request)) {
      await auditTelemetryAction('delete_conversation', id, 'denied_origin');
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const deleted = await deleteObservabilityConversation(id);
    return Response.json(
      { deleted },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof AdminObservabilityValidationError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    const category = error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'unknown';
    console.error('[/api/admin/observability/conversations/:id] delete_failed', { category });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
