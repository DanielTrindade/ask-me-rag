import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_USAGE_CONFIG, type ChatUsageConfig } from './governance-config';
import { admitChatRequest } from './governance';
import type { AdmissionDecision } from './governance-store';

const request = {
  requestId: 'request-1',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  visitorKey: 'visitor-hash' as string | null,
};

function config(
  mode: ChatUsageConfig['governance']['mode'] = 'enforce',
  overrides: Partial<ChatUsageConfig['governance']> = {},
): ChatUsageConfig {
  return {
    ...DEFAULT_CHAT_USAGE_CONFIG,
    governance: { ...DEFAULT_CHAT_USAGE_CONFIG.governance, mode, ...overrides },
    budget: { ...DEFAULT_CHAT_USAGE_CONFIG.budget },
    cache: { ...DEFAULT_CHAT_USAGE_CONFIG.cache },
    rollout: { ...DEFAULT_CHAT_USAGE_CONFIG.rollout },
  };
}

function reserve(decision: AdmissionDecision) {
  return vi.fn(async () => ({ decision, requestId: request.requestId }));
}

describe('chat governance service', () => {
  it('não acessa o store no modo off', async () => {
    const store = reserve('allowed');
    await expect(admitChatRequest(request, { config: config('off'), reserve: store }))
      .resolves.toMatchObject({ allowed: true, decision: 'off', shouldFinalize: false });
    expect(store).not.toHaveBeenCalled();
  });

  it('retorna reserva finalizável quando allowed', async () => {
    await expect(admitChatRequest(request, { config: config(), reserve: reserve('allowed') }))
      .resolves.toMatchObject({
        allowed: true, decision: 'allowed', reservationRequestId: 'request-1', shouldFinalize: true,
      });
  });

  it.each<AdmissionDecision>([
    'duplicate', 'visitor_limited', 'global_limited', 'conversation_busy', 'disabled',
  ])('aplica a decisão negativa %s em enforce', async (decision) => {
    await expect(admitChatRequest(request, { config: config(), reserve: reserve(decision) }))
      .resolves.toMatchObject({ allowed: false, decision, shouldFinalize: false });
  });

  it('mantém idempotência, lease e kill switch bloqueantes no modo shadow', async () => {
    for (const decision of ['duplicate', 'conversation_busy', 'disabled'] as const) {
      await expect(admitChatRequest(request, {
        config: config('shadow'), reserve: reserve(decision),
      })).resolves.toMatchObject({ allowed: false, decision });
    }
  });

  it('observa limites sem bloquear no modo shadow', async () => {
    await expect(admitChatRequest(request, {
      config: config('shadow'), reserve: reserve('visitor_limited'),
    })).resolves.toMatchObject({
      allowed: true, decision: 'off', observedDecision: 'visitor_limited', shouldFinalize: false,
    });
  });

  it('aplica fallback sem visitante mantendo conversa e teto global', async () => {
    const store = reserve('global_limited');
    await admitChatRequest({ ...request, visitorKey: null }, { config: config(), reserve: store });
    expect(store).toHaveBeenCalledWith(expect.objectContaining({
      visitorKey: null, conversationId: 'conversation-1', globalDailyLimit: 500,
    }));
  });

  it('falha fechado quando o store está indisponível', async () => {
    const unavailable = vi.fn(async () => { throw new Error('private database detail'); });
    await expect(admitChatRequest(request, { config: config(), reserve: unavailable }))
      .resolves.toEqual({
        allowed: false, decision: 'governance_unavailable', shouldFinalize: false,
      });
  });

  it('permite bypass emergencial de orçamento, mas não do kill switch', async () => {
    const bypass = config();
    bypass.rollout.emergencyBypass = true;
    await expect(admitChatRequest(request, { config: bypass, reserve: reserve('global_limited') }))
      .resolves.toMatchObject({ allowed: true, decision: 'emergency_bypass' });

    const killed = config('enforce', { killSwitch: true });
    await expect(admitChatRequest(request, { config: killed, reserve: reserve('disabled') }))
      .resolves.toMatchObject({ allowed: false, decision: 'disabled' });
  });
});
