import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { beginChatTelemetry, type BeginChatTelemetryInput } from './store';

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
