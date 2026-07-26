import { describe, expect, it } from 'vitest';
import { estimateGenerationCost, lookupModelPrice, PRICING_CATALOG_VERSION } from './pricing';

describe('pricing catalog', () => {
  it('localiza preço versionado do modelo padrão', () => {
    expect(lookupModelPrice('google', 'gemini-2.5-flash-lite')).toMatchObject({
      currency: 'USD',
      inputUsdPerMillionTokens: 0.1,
      outputUsdPerMillionTokens: 0.4,
    });
    expect(PRICING_CATALOG_VERSION).toBe('2026-07-17');
  });

  it('calcula entrada, saída e total separadamente', () => {
    expect(estimateGenerationCost({
      provider: 'google', model: 'gemini-2.5-flash-lite',
      inputTokens: 1_000_000, outputTokens: 500_000,
    })).toEqual({
      inputCostUsd: 0.1,
      outputCostUsd: 0.2,
      totalCostUsd: 0.3,
      currency: 'USD',
      pricingVersion: '2026-07-17',
    });
  });

  it('retorna null quando preço ou uso não é conhecido', () => {
    expect(estimateGenerationCost({ provider: 'unknown', model: 'x', inputTokens: 10 }))
      .toMatchObject({ totalCostUsd: null, pricingVersion: null });
    expect(estimateGenerationCost({
      provider: 'google', model: 'gemini-2.5-flash-lite', inputTokens: 10,
    })).toMatchObject({ inputCostUsd: 0.000001, outputCostUsd: null, totalCostUsd: null });
  });
});
