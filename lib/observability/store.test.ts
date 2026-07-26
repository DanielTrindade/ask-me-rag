import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ rpc: mocks.rpc }),
}));

import {
  beginChatTelemetry,
  finishChatTelemetry,
  type BeginChatTelemetryInput,
} from './store';

const requestId = 'a2adfc13-1686-4b5f-b6f2-f786bfd21dd6';
const input: BeginChatTelemetryInput = {
  requestId,
  conversationId: '92adfc13-1686-4b5f-b6f2-f786bfd21dd6',
  userMessageId: 'user-1',
  userContent: 'Pergunta',
  ipHash: 'hash',
  ipEncrypted: 'encrypted',
  deviceType: 'desktop',
  isBot: false,
  osName: 'Windows',
  osMajor: '11',
  browserName: 'Chrome',
  browserMajor: '140',
  preferredLanguage: 'pt-br',
  traceId: requestId,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('beginChatTelemetry', () => {
  it('keeps the canonical request active when the secondary metric write fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.rpc
      .mockResolvedValueOnce({ data: requestId, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'metric_failed' } });

    await expect(beginChatTelemetry(input)).resolves.toBe(requestId);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'record_chat_telemetry_write_ms',
      expect.objectContaining({ p_request_id: requestId }),
    );
    expect(warning).toHaveBeenCalledWith(
      '[chat-observability] begin_metric_failed',
      { category: 'metric_failed' },
    );
    warning.mockRestore();
  });

  it('returns null only when the transactional begin RPC fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'begin_failed' } });

    await expect(beginChatTelemetry(input)).resolves.toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      '[chat-observability] begin_failed',
      { category: 'begin_failed' },
    );
    warning.mockRestore();
  });
});


describe('finishChatTelemetry usage metrics', () => {
  it('persiste governança, cache, tentativas e custo no RPC v2', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(finishChatTelemetry({
      requestId,
      status: 'completed',
      durationMs: 100,
      governanceDecision: 'allowed',
      cacheStatus: 'miss',
      providerAttempts: 2,
      retryable: false,
      providerCalled: true,
      inputCostUsd: 0.0001,
      outputCostUsd: 0.0004,
      totalCostUsd: 0.0005,
      costCurrency: 'USD',
      pricingVersion: '2026-07-17',
    })).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'finish_chat_request_v2',
      expect.objectContaining({
        p_governance_decision: 'allowed',
        p_cache_status: 'miss',
        p_provider_attempts: 2,
        p_provider_called: true,
        p_total_cost_usd: 0.0005,
        p_cost_currency: 'USD',
        p_pricing_version: '2026-07-17',
      }),
    );
  });
});
