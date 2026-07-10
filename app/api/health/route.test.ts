import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.fn();
const select = vi.fn(() => ({ limit }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ from }),
}));

import { GET } from '@/app/api/health/route';

beforeEach(() => {
  vi.stubEnv('LLM_PROVIDER', 'google');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-placeholder');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'google-placeholder');
  vi.stubEnv('ADMIN_PASSWORD', 'a-production-safe-placeholder');
  limit.mockResolvedValue({ error: null, count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('returns ready without exposing dependency data', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(from).toHaveBeenCalledWith('schema_migrations');
    expect(select).toHaveBeenCalledWith('name', { head: true, count: 'exact' });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('returns a configuration category when required configuration is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
    expect(from).not.toHaveBeenCalled();
  });

  it('requires the selected optional provider key', async () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'configuration' });
  });

  it('returns a dependency category when Supabase is unavailable', async () => {
    limit.mockResolvedValue({ error: { message: 'sensitive database detail' }, count: null });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'dependency' });
  });

  it('returns a dependency category when Supabase exceeds the timeout', async () => {
    vi.useFakeTimers();
    limit.mockReturnValue(new Promise(() => undefined));

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(3_001);
    const response = await responsePromise;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'dependency' });
  });
});

