import 'server-only';

export const PRICING_CATALOG_VERSION = '2026-07-17';

export interface ModelPrice {
  provider: string;
  model: string;
  currency: 'USD';
  effectiveFrom: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

// Official source captured for this version:
// https://ai.google.dev/gemini-api/docs/pricing
const PRICES: readonly ModelPrice[] = [
  {
    provider: 'google',
    model: 'gemini-2.5-flash-lite',
    currency: 'USD',
    effectiveFrom: '2026-07-17',
    inputUsdPerMillionTokens: 0.1,
    outputUsdPerMillionTokens: 0.4,
  },
] as const;

export function lookupModelPrice(provider: string, model: string) {
  return PRICES.find((price) => price.provider === provider && price.model === model) ?? null;
}

function tokenCost(tokens: number | undefined, usdPerMillion: number) {
  return tokens === undefined || !Number.isSafeInteger(tokens) || tokens < 0
    ? null
    : Number(((tokens * usdPerMillion) / 1_000_000).toFixed(12));
}

export function estimateGenerationCost(input: {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const price = lookupModelPrice(input.provider, input.model);
  if (!price) {
    return {
      inputCostUsd: null,
      outputCostUsd: null,
      totalCostUsd: null,
      currency: null,
      pricingVersion: null,
    };
  }
  const inputCostUsd = tokenCost(input.inputTokens, price.inputUsdPerMillionTokens);
  const outputCostUsd = tokenCost(input.outputTokens, price.outputUsdPerMillionTokens);
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd === null || outputCostUsd === null
      ? null
      : Number((inputCostUsd + outputCostUsd).toFixed(12)),
    currency: price.currency,
    pricingVersion: PRICING_CATALOG_VERSION,
  };
}
