import { getServiceClient } from '@/lib/supabase';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
} as const;

const HEALTH_CHECK_TIMEOUT_MS = 3_000;

type HealthFailureReason = 'configuration' | 'dependency';

function healthResponse(status: 200 | 503, reason?: HealthFailureReason) {
  return Response.json(
    reason ? { status: 'unavailable', reason } : { status: 'ok' },
    { status, headers: NO_STORE_HEADERS },
  );
}

function hasRequiredConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.LLM_PROVIDER ?? 'google';
  const required = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.GOOGLE_GENERATIVE_AI_API_KEY,
    env.ADMIN_PASSWORD,
  ];

  if (provider === 'anthropic') required.push(env.ANTHROPIC_API_KEY);
  if (provider === 'openai') required.push(env.OPENAI_API_KEY);

  return ['google', 'anthropic', 'openai'].includes(provider) && required.every(Boolean);
}

async function checkSupabase(timeoutMs = HEALTH_CHECK_TIMEOUT_MS) {
  const query = getServiceClient()
    .from('schema_migrations')
    .select('name', { head: true, count: 'exact' })
    .limit(1);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve(query),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('health_check_timeout')), timeoutMs);
      }),
    ]);

    if (result.error) {
      throw new Error(`supabase_health_check_failed: ${result.error.message}`);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  if (!hasRequiredConfiguration()) {
    return healthResponse(503, 'configuration');
  }

  try {
    await checkSupabase();
    return healthResponse(200);
  } catch (error) {
    const category = error instanceof Error ? error.message : 'unknown';
    console.error(`[/api/health] dependency check failed (${category})`);
    return healthResponse(503, 'dependency');
  }
}

