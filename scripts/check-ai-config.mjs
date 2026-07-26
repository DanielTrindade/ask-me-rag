import { pathToFileURL } from 'node:url';

export function checkAiConfig(env = process.env) {
  const errors = [];

  function value(name, fallback = '') {
    return env[name]?.trim() || fallback;
  }

  function oneOf(name, actual, allowed) {
    if (!allowed.includes(actual)) errors.push(`${name} must be one of: ${allowed.join(', ')}.`);
  }

  function boolean(name, fallback) {
    const actual = value(name, fallback);
    if (actual !== 'true' && actual !== 'false') errors.push(`${name} must be true or false.`);
  }

  function integer(name, fallback, minimum, maximum) {
    const actual = Number(value(name, String(fallback)));
    if (!Number.isSafeInteger(actual) || actual < minimum || actual > maximum) {
      errors.push(`${name} must be an integer from ${minimum} to ${maximum}.`);
      return fallback;
    }
    return actual;
  }

  const chatProvider = value('CHAT_LLM_PROVIDER', value('LLM_PROVIDER', 'google')).toLowerCase();
  const embeddingProvider = value('EMBEDDING_PROVIDER', 'google').toLowerCase();
  oneOf('CHAT_LLM_PROVIDER', chatProvider, ['google', 'vertex', 'anthropic', 'openai']);
  oneOf('EMBEDDING_PROVIDER', embeddingProvider, ['google', 'vertex']);

  const mode = value('CHAT_GOVERNANCE_MODE', 'off').toLowerCase();
  oneOf('CHAT_GOVERNANCE_MODE', mode, ['off', 'shadow', 'enforce']);
  boolean('CHAT_LLM_KILL_SWITCH', 'false');
  boolean('CHAT_GOVERNANCE_EMERGENCY_BYPASS', 'false');
  boolean('CHAT_RESPONSE_CACHE_ENABLED', 'false');
  boolean('CHAT_EMBEDDING_CACHE_ENABLED', 'false');

  const perMinute = integer('CHAT_VISITOR_PER_MINUTE_LIMIT', 4, 1, 4_000);
  const visitorDaily = integer('CHAT_VISITOR_DAILY_LIMIT', 50, 1, 100_000);
  const globalDaily = integer('CHAT_GLOBAL_DAILY_LIMIT', 500, 1, 1_000_000);
  const reserve = integer('CHAT_OPERATIONAL_RESERVE_DAILY', 50, 0, 999_999);
  integer('CHAT_CONVERSATION_LEASE_TTL_SECONDS', 60, 30, 900);
  const history = integer('CHAT_HISTORY_TOKEN_BUDGET', 4_000, 128, 1_000_000);
  const rag = integer('CHAT_RAG_TOKEN_BUDGET', 2_000, 128, 1_000_000);
  const total = integer('CHAT_TOTAL_INPUT_TOKEN_BUDGET', 8_000, 512, 1_000_000);
  integer('CHAT_MAX_OUTPUT_TOKENS', 500, 64, 8_192);
  integer('CHAT_RAG_MAX_CHUNKS', 3, 1, 10);
  integer('CHAT_RESPONSE_CACHE_TTL_SECONDS', 86_400, 60, 604_800);
  integer('CHAT_EMBEDDING_CACHE_TTL_SECONDS', 2_592_000, 60, 7_776_000);

  if (visitorDaily < perMinute) errors.push('CHAT_VISITOR_DAILY_LIMIT must be at least the per-minute limit.');
  if (reserve >= globalDaily) errors.push('CHAT_OPERATIONAL_RESERVE_DAILY must be lower than CHAT_GLOBAL_DAILY_LIMIT.');
  if (history + rag > total) errors.push('History plus RAG token budgets must fit in CHAT_TOTAL_INPUT_TOKEN_BUDGET.');

  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: value('CHAT_QUOTA_RESET_TIME_ZONE', 'America/Los_Angeles'),
    }).format();
  } catch {
    errors.push('CHAT_QUOTA_RESET_TIME_ZONE must be a valid IANA time zone.');
  }

  if (value('EMBEDDING_MODEL', 'gemini-embedding-001') !== 'gemini-embedding-001') {
    errors.push('EMBEDDING_MODEL must remain gemini-embedding-001 until documents are re-ingested.');
  }
  if (value('EMBEDDING_DIMENSION', '1536') !== '1536') {
    errors.push('EMBEDDING_DIMENSION must remain 1536.');
  }

  if (chatProvider === 'vertex' || embeddingProvider === 'vertex') {
    const forbidden = [
      'GOOGLE_APPLICATION_CREDENTIALS',
      'GOOGLE_VERTEX_API_KEY',
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_PRIVATE_KEY_ID',
    ].filter((name) => value(name));
    if (forbidden.length) errors.push(`Vertex must use ADC; remove: ${forbidden.join(', ')}.`);

    for (const role of ['CHAT', 'EMBEDDING']) {
      if ((role === 'CHAT' ? chatProvider : embeddingProvider) !== 'vertex') continue;
      if (!value(`${role}_VERTEX_PROJECT`, value('GOOGLE_VERTEX_PROJECT'))) {
        errors.push(`${role}_VERTEX_PROJECT or GOOGLE_VERTEX_PROJECT is required.`);
      }
      if (!value(`${role}_VERTEX_LOCATION`, value('GOOGLE_VERTEX_LOCATION'))) {
        errors.push(`${role}_VERTEX_LOCATION or GOOGLE_VERTEX_LOCATION is required.`);
      }
    }
  }

  return {
    errors,
    summary: `chat=${chatProvider} embedding=${embeddingProvider} governance=${mode}`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkAiConfig();
  if (result.errors.length) {
    for (const error of result.errors) console.error(`[ai-config] ${error}`);
    process.exitCode = 2;
  } else {
    console.log(`[ai-config] valid ${result.summary}`);
  }
}
