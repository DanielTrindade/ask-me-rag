import 'server-only';

import type { LanguageModelV3, SharedV3ProviderOptions } from '@ai-sdk/provider';
import type { EmbeddingModel } from 'ai';

export type AiRuntimeRole = 'chat' | 'embedding';
export type ChatProvider = 'groq';
export type EmbeddingProvider = 'google' | 'vertex';
export type EmbeddingPurpose = 'query' | 'document';

export class AiRuntimeConfigurationError extends Error {
  constructor(
    readonly role: AiRuntimeRole,
    readonly variable: string,
  ) {
    super(`Invalid ${role} runtime configuration: ${variable}`);
    this.name = 'AiRuntimeConfigurationError';
  }
}

export interface ChatRuntime {
  readonly role: 'chat';
  readonly provider: ChatProvider;
  readonly modelId: string;
  readonly displayName: string;
  readonly model: LanguageModelV3;
  readonly providerOptions?: SharedV3ProviderOptions;
  readonly capabilities: {
    readonly streaming: true;
    readonly thinkingControl: boolean;
  };
}

export interface EmbeddingRuntime {
  readonly role: 'embedding';
  readonly provider: EmbeddingProvider;
  readonly modelId: string;
  readonly displayName: string;
  readonly dimension: 1536;
  readonly model: EmbeddingModel;
  readonly providerOptions: (purpose: EmbeddingPurpose) => SharedV3ProviderOptions;
  readonly capabilities: {
    readonly batching: true;
    readonly purposeSpecific: true;
  };
}
