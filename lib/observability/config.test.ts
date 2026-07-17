import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTelemetryRetention, getTrustedProxyHops, isChatObservabilityEnabled } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('observability config', () => {
  it('is disabled by default and fails closed for proxy configuration', () => {
    vi.stubEnv('CHAT_OBSERVABILITY_ENABLED', 'false');
    vi.stubEnv('CHAT_TRUSTED_PROXY_HOPS', '');
    expect(isChatObservabilityEnabled()).toBe(false);
    expect(getTrustedProxyHops()).toBeNull();
  });

  it('accepts explicit proxy hops and bounded retention values', () => {
    vi.stubEnv('CHAT_OBSERVABILITY_ENABLED', 'true');
    vi.stubEnv('CHAT_TRUSTED_PROXY_HOPS', '1');
    vi.stubEnv('CHAT_IP_RETENTION_DAYS', '5');
    vi.stubEnv('CHAT_CONVERSATION_RETENTION_DAYS', '20');
    vi.stubEnv('CHAT_AUDIT_RETENTION_DAYS', '60');
    expect(isChatObservabilityEnabled()).toBe(true);
    expect(getTrustedProxyHops()).toBe(1);
    expect(getTelemetryRetention()).toEqual({ ipDays: 5, conversationDays: 20, auditDays: 60 });
  });

  it('uses safe defaults for malformed retention values', () => {
    vi.stubEnv('CHAT_IP_RETENTION_DAYS', '-1');
    vi.stubEnv('CHAT_CONVERSATION_RETENTION_DAYS', 'many');
    vi.stubEnv('CHAT_AUDIT_RETENTION_DAYS', '99999');
    expect(getTelemetryRetention()).toEqual({ ipDays: 7, conversationDays: 30, auditDays: 90 });
  });
});

