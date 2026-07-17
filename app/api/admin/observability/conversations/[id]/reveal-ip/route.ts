import { hasAdminSession } from '@/lib/admin-session';
import {
  auditTelemetryAction,
  revealConversationIp,
} from '@/lib/observability/admin-store';
import {
  AdminObservabilityValidationError,
  assertConversationId,
  isSameOrigin,
} from '@/lib/observability/admin-validation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

async function auditUnauthenticatedReveal(rawId: string) {
  try {
    const id = assertConversationId(rawId);
    await auditTelemetryAction('reveal_ip', id, 'denied');
  } catch (error) {
    if (!(error instanceof AdminObservabilityValidationError)) {
      console.error(
        '[/api/admin/observability/conversations/:id/reveal-ip] denied_audit_failed',
      );
    }
  }
}

export async function POST(request: Request, context: RouteContext) {
  const rawId = (await context.params).id;
  if (!(await hasAdminSession())) {
    await auditUnauthenticatedReveal(rawId);
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    const id = assertConversationId(rawId);
    if (!isSameOrigin(request)) {
      await auditTelemetryAction('reveal_ip', id, 'denied_origin');
      return Response.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
    }

    const ip = await revealConversationIp(id);
    if (!ip) {
      await auditTelemetryAction('reveal_ip', id, 'unavailable');
      return Response.json(
        { error: 'ip_unavailable' },
        { status: 410, headers: NO_STORE },
      );
    }
    await auditTelemetryAction('reveal_ip', id, 'revealed');
    return Response.json({ ip }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AdminObservabilityValidationError) {
      return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    }
    console.error('[/api/admin/observability/conversations/:id/reveal-ip] reveal_failed');
    return Response.json({ error: 'internal_error' }, { status: 500, headers: NO_STORE });
  }
}
