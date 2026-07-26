import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ rpc: mocks.rpc }),
}));

import {
  GovernanceStoreError,
  finalizeChatGeneration,
  readChatDailyBudget,
  reserveChatGeneration,
} from './governance-store';

const input = {
  requestId: 'request-1',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  visitorKey: 'visitor-hash',
  disabled: false,
  visitorPerMinuteLimit: 4,
  visitorDailyLimit: 50,
  globalDailyLimit: 500,
  operationalReserveDaily: 50,
  resetTimeZone: 'America/Los_Angeles',
  conversationLeaseTtlSeconds: 60,
};

beforeEach(() => vi.clearAllMocks());

describe('governance store', () => {
  it('reserva consumo com parâmetros fechados e interpreta a decisão', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        decision: 'allowed', requestId: 'request-1', status: 'reserved',
        leaseExpiresAt: '2026-07-18T01:00:00Z', resetAt: '2026-07-18T07:00:00Z',
      },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: 0, error: null });

    await expect(reserveChatGeneration(input)).resolves.toMatchObject({
      decision: 'allowed', requestId: 'request-1', status: 'reserved',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_chat_generation', {
      p_request_id: 'request-1',
      p_conversation_id: 'conversation-1',
      p_message_id: 'message-1',
      p_visitor_key: 'visitor-hash',
      p_disabled: false,
      p_visitor_minute_limit: 4,
      p_visitor_daily_limit: 50,
      p_global_daily_limit: 500,
      p_operational_reserve: 50,
      p_reset_time_zone: 'America/Los_Angeles',
      p_lease_ttl_seconds: 60,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('record_chat_usage_thresholds', {
      p_limit: 450,
    });
  });

  it('rejeita resultados ou erros sem vazar detalhes do banco', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { decision: 'unexpected' }, error: null });
    await expect(reserveChatGeneration(input)).rejects.toEqual(
      expect.objectContaining({ name: 'GovernanceStoreError', operation: 'reserve' }),
    );

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('private database detail') });
    const error = await reserveChatGeneration(input).catch((value) => value);
    expect(error).toBeInstanceOf(GovernanceStoreError);
    expect(error.message).not.toContain('private database detail');
  });

  it('finaliza a reserva idempotentemente', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(finalizeChatGeneration('request-1', 'aborted')).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_chat_generation', {
      p_request_id: 'request-1', p_status: 'aborted',
    });
  });

  it('lê o orçamento diário sem chamada ao provider', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { globalUsed: 12, globalLimit: 450, visitorUsed: 2, resetAt: 'reset' },
      error: null,
    });
    await expect(readChatDailyBudget({
      visitorKey: null,
      resetTimeZone: 'America/Los_Angeles',
      globalDailyLimit: 500,
      operationalReserveDaily: 50,
    })).resolves.toMatchObject({ globalUsed: 12, globalLimit: 450, visitorUsed: 2 });
  });
});
