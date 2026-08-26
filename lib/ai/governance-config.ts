import 'server-only';

export type GovernanceMode = 'off' | 'shadow' | 'enforce';

type EnvSource = Readonly<Record<string, string | undefined>>;

export interface ChatUsageConfig {
  governance: {
    mode: GovernanceMode;
    killSwitch: boolean;
    visitorPerMinuteLimit: number;
    visitorDailyLimit: number;
    globalDailyLimit: number;
    operationalReserveDaily: number;
    resetTimeZone: string;
    conversationLeaseTtlSeconds: number;
  };
  budget: {
    historyTokens: number;
    ragTokens: number;
    totalInputTokens: number;
    maxOutputTokens: number;
    ragMaxChunks: number;
  };
  cache: {
    responseEnabled: boolean;
    responseTtlSeconds: number;
  };
  rollout: {
    emergencyBypass: boolean;
  };
}

export class ChatUsageConfigurationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    const uniqueVariables = [...new Set(variables)].sort();
    super(`Invalid chat usage configuration: ${uniqueVariables.join(', ')}`);
    this.name = 'ChatUsageConfigurationError';
    this.variables = uniqueVariables;
  }
}

export const DEFAULT_CHAT_USAGE_CONFIG: ChatUsageConfig = {
  governance: {
    mode: 'off',
    killSwitch: false,
    visitorPerMinuteLimit: 4,
    visitorDailyLimit: 50,
    globalDailyLimit: 500,
    operationalReserveDaily: 50,
    resetTimeZone: 'America/Los_Angeles',
    conversationLeaseTtlSeconds: 60,
  },
  budget: {
    historyTokens: 4_000,
    ragTokens: 2_000,
    totalInputTokens: 8_000,
    maxOutputTokens: 500,
    ragMaxChunks: 3,
  },
  cache: {
    responseEnabled: false,
    responseTtlSeconds: 86_400,
  },
  rollout: {
    emergencyBypass: false,
  },
};

const SUPPORTED_TIME_ZONES = new Set([
  'UTC',
  ...Intl.supportedValuesOf('timeZone'),
]);

function parseBoolean(
  env: EnvSource,
  name: string,
  fallback: boolean,
  invalid: string[],
) {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  invalid.push(name);
  return fallback;
}

function parseInteger(
  env: EnvSource,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  invalid: string[],
) {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum) {
    return parsed;
  }
  invalid.push(name);
  return fallback;
}

function parseMode(env: EnvSource, invalid: string[]): GovernanceMode {
  const value = env.CHAT_GOVERNANCE_MODE?.trim().toLowerCase();
  if (!value) return DEFAULT_CHAT_USAGE_CONFIG.governance.mode;
  if (value === 'off' || value === 'shadow' || value === 'enforce') return value;
  invalid.push('CHAT_GOVERNANCE_MODE');
  return DEFAULT_CHAT_USAGE_CONFIG.governance.mode;
}

function parseTimeZone(env: EnvSource, invalid: string[]) {
  const value = env.CHAT_QUOTA_RESET_TIME_ZONE?.trim();
  if (!value) return DEFAULT_CHAT_USAGE_CONFIG.governance.resetTimeZone;
  if (SUPPORTED_TIME_ZONES.has(value)) return value;
  invalid.push('CHAT_QUOTA_RESET_TIME_ZONE');
  return DEFAULT_CHAT_USAGE_CONFIG.governance.resetTimeZone;
}

function validateRelationships(config: ChatUsageConfig, invalid: string[]) {
  if (config.governance.visitorDailyLimit < config.governance.visitorPerMinuteLimit) {
    invalid.push('CHAT_VISITOR_DAILY_LIMIT', 'CHAT_VISITOR_PER_MINUTE_LIMIT');
  }
  if (config.governance.operationalReserveDaily >= config.governance.globalDailyLimit) {
    invalid.push('CHAT_OPERATIONAL_RESERVE_DAILY', 'CHAT_GLOBAL_DAILY_LIMIT');
  }
  if (
    config.budget.historyTokens + config.budget.ragTokens >
    config.budget.totalInputTokens
  ) {
    invalid.push(
      'CHAT_HISTORY_TOKEN_BUDGET',
      'CHAT_RAG_TOKEN_BUDGET',
      'CHAT_TOTAL_INPUT_TOKEN_BUDGET',
    );
  }
}

export function parseChatUsageConfig(env: EnvSource = process.env): ChatUsageConfig {
  const invalid: string[] = [];
  const config: ChatUsageConfig = {
    governance: {
      mode: parseMode(env, invalid),
      killSwitch: parseBoolean(
        env,
        'CHAT_LLM_KILL_SWITCH',
        DEFAULT_CHAT_USAGE_CONFIG.governance.killSwitch,
        invalid,
      ),
      visitorPerMinuteLimit: parseInteger(
        env,
        'CHAT_VISITOR_PER_MINUTE_LIMIT',
        DEFAULT_CHAT_USAGE_CONFIG.governance.visitorPerMinuteLimit,
        1,
        4_000,
        invalid,
      ),
      visitorDailyLimit: parseInteger(
        env,
        'CHAT_VISITOR_DAILY_LIMIT',
        DEFAULT_CHAT_USAGE_CONFIG.governance.visitorDailyLimit,
        1,
        100_000,
        invalid,
      ),
      globalDailyLimit: parseInteger(
        env,
        'CHAT_GLOBAL_DAILY_LIMIT',
        DEFAULT_CHAT_USAGE_CONFIG.governance.globalDailyLimit,
        1,
        1_000_000,
        invalid,
      ),
      operationalReserveDaily: parseInteger(
        env,
        'CHAT_OPERATIONAL_RESERVE_DAILY',
        DEFAULT_CHAT_USAGE_CONFIG.governance.operationalReserveDaily,
        0,
        999_999,
        invalid,
      ),
      resetTimeZone: parseTimeZone(env, invalid),
      conversationLeaseTtlSeconds: parseInteger(
        env,
        'CHAT_CONVERSATION_LEASE_TTL_SECONDS',
        DEFAULT_CHAT_USAGE_CONFIG.governance.conversationLeaseTtlSeconds,
        30,
        900,
        invalid,
      ),
    },
    budget: {
      historyTokens: parseInteger(
        env,
        'CHAT_HISTORY_TOKEN_BUDGET',
        DEFAULT_CHAT_USAGE_CONFIG.budget.historyTokens,
        128,
        1_000_000,
        invalid,
      ),
      ragTokens: parseInteger(
        env,
        'CHAT_RAG_TOKEN_BUDGET',
        DEFAULT_CHAT_USAGE_CONFIG.budget.ragTokens,
        128,
        1_000_000,
        invalid,
      ),
      totalInputTokens: parseInteger(
        env,
        'CHAT_TOTAL_INPUT_TOKEN_BUDGET',
        DEFAULT_CHAT_USAGE_CONFIG.budget.totalInputTokens,
        512,
        1_000_000,
        invalid,
      ),
      maxOutputTokens: parseInteger(
        env,
        'CHAT_MAX_OUTPUT_TOKENS',
        DEFAULT_CHAT_USAGE_CONFIG.budget.maxOutputTokens,
        64,
        8_192,
        invalid,
      ),
      ragMaxChunks: parseInteger(
        env,
        'CHAT_RAG_MAX_CHUNKS',
        DEFAULT_CHAT_USAGE_CONFIG.budget.ragMaxChunks,
        1,
        10,
        invalid,
      ),
    },
    cache: {
      responseEnabled: parseBoolean(
        env,
        'CHAT_RESPONSE_CACHE_ENABLED',
        DEFAULT_CHAT_USAGE_CONFIG.cache.responseEnabled,
        invalid,
      ),
      responseTtlSeconds: parseInteger(
        env,
        'CHAT_RESPONSE_CACHE_TTL_SECONDS',
        DEFAULT_CHAT_USAGE_CONFIG.cache.responseTtlSeconds,
        60,
        604_800,
        invalid,
      ),
    },
    rollout: {
      emergencyBypass: parseBoolean(
        env,
        'CHAT_GOVERNANCE_EMERGENCY_BYPASS',
        DEFAULT_CHAT_USAGE_CONFIG.rollout.emergencyBypass,
        invalid,
      ),
    },
  };

  validateRelationships(config, invalid);
  if (invalid.length > 0 && env.NODE_ENV === 'production') {
    throw new ChatUsageConfigurationError(invalid);
  }

  return invalid.length > 0 ? DEFAULT_CHAT_USAGE_CONFIG : config;
}
