import 'server-only';

import { createVertex } from '@ai-sdk/google-vertex';
import { GoogleAuth } from 'google-auth-library';
import { AiRuntimeConfigurationError } from '@/lib/ai/runtime-contracts';

type EnvSource = Readonly<Record<string, string | undefined>>;
type VertexFactory = typeof createVertex;

const FORBIDDEN_EXPLICIT_CREDENTIALS = [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_VERTEX_API_KEY',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_PRIVATE_KEY_ID',
] as const;

function required(env: EnvSource, names: readonly string[]) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  throw new AiRuntimeConfigurationError('embedding', names[0]);
}

export function resolveVertexSettings(env: EnvSource = process.env) {
  for (const variable of FORBIDDEN_EXPLICIT_CREDENTIALS) {
    if (env[variable]?.trim()) {
      throw new AiRuntimeConfigurationError('embedding', variable);
    }
  }

  return {
    project: required(env, ['EMBEDDING_VERTEX_PROJECT', 'GOOGLE_VERTEX_PROJECT']),
    location: required(env, ['EMBEDDING_VERTEX_LOCATION', 'GOOGLE_VERTEX_LOCATION']),
  };
}

export function createVertexRuntimeProvider(
  env: EnvSource = process.env,
  factory: VertexFactory = createVertex,
) {
  return factory(resolveVertexSettings(env));
}

export function usesVertex(env: EnvSource = process.env) {
  return env.EMBEDDING_PROVIDER?.trim().toLowerCase() === 'vertex';
}

export async function validateVertexAdc(
  getClient: () => Promise<unknown> = async () => {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    return auth.getClient();
  },
) {
  try {
    await getClient();
  } catch {
    throw new AiRuntimeConfigurationError('embedding', 'GOOGLE_ADC');
  }
}
