import { describe, expect, it } from 'vitest';
import {
  ChatUsageConfigurationError,
  DEFAULT_CHAT_USAGE_CONFIG,
  parseChatUsageConfig,
} from './governance-config';

describe('parseChatUsageConfig', () => {
  it('aplica defaults conservadores sem configuração explícita', () => {
    expect(parseChatUsageConfig({ NODE_ENV: 'test' })).toEqual(DEFAULT_CHAT_USAGE_CONFIG);
  });

  it.each(['off', 'shadow', 'enforce'] as const)('aceita o modo %s', (mode) => {
    expect(
      parseChatUsageConfig({ NODE_ENV: 'production', CHAT_GOVERNANCE_MODE: mode })
        .governance.mode,
    ).toBe(mode);
  });

  it('interpreta kill switch, cache e bypass como booleanos estritos', () => {
    const config = parseChatUsageConfig({
      NODE_ENV: 'production',
      CHAT_LLM_KILL_SWITCH: 'true',
      CHAT_RESPONSE_CACHE_ENABLED: 'true',
      CHAT_GOVERNANCE_EMERGENCY_BYPASS: 'false',
    });

    expect(config.governance.killSwitch).toBe(true);
    expect(config.cache.responseEnabled).toBe(true);
    expect(config.rollout.emergencyBypass).toBe(false);
  });

  it('ativa por padrão a verificação de fundamentação e o guarda de injeção', () => {
    const config = parseChatUsageConfig({ NODE_ENV: 'test' });
    expect(config.groundedness.enabled).toBe(true);
    expect(config.injectionGuard.enabled).toBe(true);
  });

  it('interpreta os toggles de defesa como booleanos estritos', () => {
    const config = parseChatUsageConfig({
      NODE_ENV: 'production',
      CHAT_GROUNDEDNESS_ENABLED: 'false',
      CHAT_INJECTION_GUARD_ENABLED: 'true',
    });

    expect(config.groundedness.enabled).toBe(false);
    expect(config.injectionGuard.enabled).toBe(true);
  });

  it('aceita overrides válidos para limites, orçamento, TTLs e zona', () => {
    const config = parseChatUsageConfig({
      NODE_ENV: 'production',
      CHAT_VISITOR_PER_MINUTE_LIMIT: '6',
      CHAT_VISITOR_DAILY_LIMIT: '80',
      CHAT_GLOBAL_DAILY_LIMIT: '800',
      CHAT_OPERATIONAL_RESERVE_DAILY: '100',
      CHAT_QUOTA_RESET_TIME_ZONE: 'UTC',
      CHAT_CONVERSATION_LEASE_TTL_SECONDS: '90',
      CHAT_HISTORY_TOKEN_BUDGET: '3000',
      CHAT_RAG_TOKEN_BUDGET: '1000',
      CHAT_TOTAL_INPUT_TOKEN_BUDGET: '6000',
      CHAT_MAX_OUTPUT_TOKENS: '700',
      CHAT_RAG_MAX_CHUNKS: '4',
      CHAT_RESPONSE_CACHE_TTL_SECONDS: '3600',
    });

    expect(config).toMatchObject({
      governance: {
        visitorPerMinuteLimit: 6,
        visitorDailyLimit: 80,
        globalDailyLimit: 800,
        operationalReserveDaily: 100,
        resetTimeZone: 'UTC',
        conversationLeaseTtlSeconds: 90,
      },
      budget: {
        historyTokens: 3000,
        ragTokens: 1000,
        totalInputTokens: 6000,
        maxOutputTokens: 700,
        ragMaxChunks: 4,
      },
      cache: {
        responseTtlSeconds: 3600,
      },
    });
  });

  it('usa o conjunto seguro de defaults para valores inválidos fora de produção', () => {
    expect(
      parseChatUsageConfig({
        NODE_ENV: 'test',
        CHAT_GOVERNANCE_MODE: 'invalid',
        CHAT_LLM_KILL_SWITCH: 'yes',
        CHAT_GLOBAL_DAILY_LIMIT: '-1',
      }),
    ).toEqual(DEFAULT_CHAT_USAGE_CONFIG);
  });

  it('falha cedo em produção sem incluir o valor inválido na mensagem', () => {
    const secretLikeValue = 'do-not-log-this-value';
    let caught: unknown;

    try {
      parseChatUsageConfig({
        NODE_ENV: 'production',
        CHAT_GLOBAL_DAILY_LIMIT: secretLikeValue,
        CHAT_LLM_KILL_SWITCH: 'yes',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChatUsageConfigurationError);
    expect((caught as ChatUsageConfigurationError).variables).toEqual([
      'CHAT_GLOBAL_DAILY_LIMIT',
      'CHAT_LLM_KILL_SWITCH',
    ]);
    expect((caught as Error).message).not.toContain(secretLikeValue);
  });

  it('rejeita relações incoerentes entre limites e orçamentos em produção', () => {
    expect(() =>
      parseChatUsageConfig({
        NODE_ENV: 'production',
        CHAT_VISITOR_PER_MINUTE_LIMIT: '10',
        CHAT_VISITOR_DAILY_LIMIT: '5',
        CHAT_GLOBAL_DAILY_LIMIT: '100',
        CHAT_OPERATIONAL_RESERVE_DAILY: '100',
        CHAT_HISTORY_TOKEN_BUDGET: '5000',
        CHAT_RAG_TOKEN_BUDGET: '4000',
        CHAT_TOTAL_INPUT_TOKEN_BUDGET: '8000',
      }),
    ).toThrow(ChatUsageConfigurationError);
  });
});
