import { hasAdminSession } from '@/lib/admin-session';
import { parseChatUsageConfig } from '@/lib/ai/governance-config';
import { getObservabilitySummary } from '@/lib/observability/admin-store';
import {
  AdminObservabilityValidationError,
  parseDateRange,
} from '@/lib/observability/admin-validation';

export async function GET(request: Request) {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const range = parseDateRange(new URL(request.url).searchParams);
    const summary = await getObservabilitySummary(range.from, range.to);
    const usageConfig = parseChatUsageConfig();
    return Response.json({
      range,
      summary: {
        ...(summary as Record<string, unknown>),
        governanceMode: usageConfig.governance.mode,
        killSwitch: usageConfig.governance.killSwitch,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AdminObservabilityValidationError) {
      return Response.json(
        { error: 'invalid_request', category: error.code },
        { status: 400 },
      );
    }
    console.error('[/api/admin/observability/summary] query_failed');
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
