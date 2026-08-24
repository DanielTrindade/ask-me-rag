import { describe, expect, it } from 'vitest';
import { checkAiConfig } from './check-ai-config.mjs';

function run(overrides: Record<string, string> = {}) {
  return checkAiConfig({
    NODE_ENV: 'production',
    CHAT_LLM_PROVIDER: 'groq',
    EMBEDDING_PROVIDER: 'google',
    CHAT_GOVERNANCE_MODE: 'shadow',
    CHAT_VISITOR_PER_MINUTE_LIMIT: '4',
    CHAT_VISITOR_DAILY_LIMIT: '50',
    CHAT_GLOBAL_DAILY_LIMIT: '500',
    CHAT_OPERATIONAL_RESERVE_DAILY: '50',
    CHAT_HISTORY_TOKEN_BUDGET: '4000',
    CHAT_RAG_TOKEN_BUDGET: '2000',
    CHAT_TOTAL_INPUT_TOKEN_BUDGET: '8000',
    EMBEDDING_MODEL: 'gemini-embedding-001',
    EMBEDDING_DIMENSION: '1536',
    ...overrides,
  });
}

describe('check-ai-config', () => {
  it('aceita a configuração free-first sem chamar providers', () => {
    const result = run();
    expect(result.errors).toEqual([]);
    expect(result.summary).toBe('chat=groq embedding=google governance=shadow');
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

  it('exige projeto/localização e proíbe credencial explícita no embedding Vertex', () => {
    const result = run({
      EMBEDDING_PROVIDER: 'vertex',
      EMBEDDING_VERTEX_PROJECT: '',
      EMBEDDING_VERTEX_LOCATION: '',
      GOOGLE_VERTEX_PROJECT: '',
      GOOGLE_VERTEX_LOCATION: '',
      GOOGLE_APPLICATION_CREDENTIALS: 'gemini-profile/key.json',
    });
    expect(result.errors.join('\n')).toContain('Vertex must use ADC');
    expect(result.errors.join('\n')).toContain('EMBEDDING_VERTEX_PROJECT');
    expect(result.errors.join('\n')).toContain('EMBEDDING_VERTEX_LOCATION');
  });

  it('mantém o contrato vetorial compatível com o banco', () => {
    const result = run({ EMBEDDING_DIMENSION: '3072' });
    expect(result.errors.join('\n')).toContain('must remain 1536');
  });
});
