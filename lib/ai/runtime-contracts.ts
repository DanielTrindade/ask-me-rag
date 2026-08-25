import 'server-only';

import type { LanguageModelV3, SharedV3ProviderOptions } from '@ai-sdk/provider';

export type AiRuntimeRole = 'chat';
export type ChatProvider = 'groq';

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
