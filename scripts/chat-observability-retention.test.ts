import { describe, expect, it, vi } from 'vitest';
import { readRetentionConfig, runRetention } from './chat-observability-retention.mjs';

const credentials = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('chat observability retention', () => {
  it('uses the documented defaults', () => {
    expect(readRetentionConfig(credentials)).toMatchObject({
      ipDays: 7,
      conversationDays: 30,
      auditDays: 90,
    });
  });

  it('rejects missing credentials and invalid retention values', () => {
    expect(() => readRetentionConfig({})).toThrow('missing_supabase_credentials');
    expect(() => readRetentionConfig({ ...credentials, CHAT_IP_RETENTION_DAYS: '0' }))
      .toThrow('invalid_retention_configuration');
  });

  it('calls the idempotent purge RPC and returns sanitized counts', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { encryptedIpsRemoved: 2, conversationsRemoved: 1, auditsRemoved: 3 },
      error: null,
    });
    const create = vi.fn(() => ({ rpc }));

    await expect(runRetention({ env: credentials, create })).resolves.toEqual({
      encryptedIpsRemoved: 2,
      conversationsRemoved: 1,
      auditsRemoved: 3,
    });
    expect(rpc).toHaveBeenCalledWith('purge_chat_telemetry', {
      p_ip_days: 7,
      p_conversation_days: 30,
      p_audit_days: 90,
    });
  });

  it('returns a sanitized database failure category', async () => {
    const create = vi.fn(() => ({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'sensitive' } }),
    }));

    await expect(runRetention({ env: credentials, create }))
      .rejects.toThrow('retention_database_failed');
  });
});
