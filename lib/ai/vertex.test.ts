import { describe, expect, it, vi } from 'vitest';
import {
  createVertexRuntimeProvider,
  resolveVertexSettings,
  usesVertex,
  validateVertexAdc,
} from './vertex';

describe('Vertex ADC configuration', () => {
  it('resolve projeto/localização de embeddings', () => {
    const env = {
      EMBEDDING_VERTEX_PROJECT: 'embedding-project',
      EMBEDDING_VERTEX_LOCATION: 'southamerica-east1',
    };
    expect(resolveVertexSettings(env)).toEqual({
      project: 'embedding-project',
      location: 'southamerica-east1',
    });
  });

  it.each([
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_VERTEX_API_KEY',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
  ] as const)('rejeita credencial explícita %s', (variable) => {
    expect(() => resolveVertexSettings({
      EMBEDDING_VERTEX_PROJECT: 'project',
      EMBEDDING_VERTEX_LOCATION: 'us-central1',
      [variable]: 'forbidden',
    })).toThrow(variable);
  });

  it('entrega somente projeto/localização ao provider oficial', () => {
    const factory = vi.fn(() => ({ provider: true })) as never;
    expect(createVertexRuntimeProvider({
      EMBEDDING_VERTEX_PROJECT: 'project',
      EMBEDDING_VERTEX_LOCATION: 'us-central1',
    }, factory)).toEqual({ provider: true });
    expect(factory).toHaveBeenCalledWith({
      project: 'project',
      location: 'us-central1',
    });
  });

  it('falha sanitizadamente quando ADC não está disponível', async () => {
    await expect(validateVertexAdc(async () => {
      throw new Error('credential body');
    })).rejects.toMatchObject({
      name: 'AiRuntimeConfigurationError',
      variable: 'GOOGLE_ADC',
    });
  });

  it('detecta Vertex somente para embeddings', () => {
    expect(usesVertex({ CHAT_LLM_PROVIDER: 'vertex' })).toBe(false);
    expect(usesVertex({ EMBEDDING_PROVIDER: 'vertex' })).toBe(true);
    expect(usesVertex({ CHAT_LLM_PROVIDER: 'groq', EMBEDDING_PROVIDER: 'google' })).toBe(false);
  });
});
