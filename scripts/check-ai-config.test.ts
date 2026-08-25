import { describe, expect, it } from 'vitest';
import { checkAiConfig } from './check-ai-config.mjs';

function run(overrides: Record<string, string> = {}) {
  return checkAiConfig({
    NODE_ENV: 'production',
    CHAT_LLM_PROVIDER: 'groq',
    CHAT_GOVERNANCE_MODE: 'shadow',
    CHAT_VISITOR_PER_MINUTE_LIMIT: '4',
    CHAT_VISITOR_DAILY_LIMIT: '50',
    CHAT_GLOBAL_DAILY_LIMIT: '500',
    CHAT_OPERATIONAL_RESERVE_DAILY: '50',
    CHAT_HISTORY_TOKEN_BUDGET: '4000',
    CHAT_RAG_TOKEN_BUDGET: '2000',
    CHAT_TOTAL_INPUT_TOKEN_BUDGET: '8000',
    ...overrides,
  });
}

describe('check-ai-config', () => {
  it('aceita a configuração free-first sem chamar providers', () => {
    const result = run();
    expect(result.errors).toEqual([]);
    expect(result.summary).toBe('chat=groq retrieval=postgres-fts governance=shadow');
  });

  it('rejeita relações de limite e orçamento incoerentes', () => {
    const result = run({
      CHAT_VISITOR_PER_MINUTE_LIMIT: '10',
      CHAT_VISITOR_DAILY_LIMIT: '5',
      CHAT_GLOBAL_DAILY_LIMIT: '50',
      CHAT_OPERATIONAL_RESERVE_DAILY: '50',
      CHAT_TOTAL_INPUT_TOKEN_BUDGET: '5000',
    });
    expect(result.errors.join('\n')).toContain('per-minute limit');
    expect(result.errors.join('\n')).toContain('lower than CHAT_GLOBAL_DAILY_LIMIT');
    expect(result.errors.join('\n')).toContain('History plus RAG token budgets');
  });

  it('rejeita providers de chat legados', () => {
    const result = run({ CHAT_LLM_PROVIDER: 'google' });
    expect(result.errors.join('\n')).toContain('CHAT_LLM_PROVIDER must be one of: groq');
  });
});
