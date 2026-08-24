import { describe, expect, it } from 'vitest';
import { estimateGenerationCost, lookupModelPrice, PRICING_CATALOG_VERSION } from './pricing';

describe('pricing catalog', () => {
  it('localiza preço versionado do modelo padrão', () => {
    expect(lookupModelPrice('groq', 'openai/gpt-oss-20b')).toMatchObject({
      currency: 'USD',
      inputUsdPerMillionTokens: 0.075,
      outputUsdPerMillionTokens: 0.3,
    });
    expect(lookupModelPrice('groq', 'openai/gpt-oss-120b')).toMatchObject({
      inputUsdPerMillionTokens: 0.15,
      outputUsdPerMillionTokens: 0.6,
    });
    expect(PRICING_CATALOG_VERSION).toBe('2026-08-24');
  });

  it('calcula entrada, saída e total separadamente', () => {
    expect(estimateGenerationCost({
      provider: 'groq', model: 'openai/gpt-oss-20b',
      inputTokens: 1_000_000, outputTokens: 500_000,
    })).toEqual({
      inputCostUsd: 0.075,
      outputCostUsd: 0.15,
      totalCostUsd: 0.225,
      currency: 'USD',
      pricingVersion: '2026-08-24',
    });
  });

  it('retorna null quando preço ou uso não é conhecido', () => {
    expect(estimateGenerationCost({ provider: 'unknown', model: 'x', inputTokens: 10 }))
      .toMatchObject({ totalCostUsd: null, pricingVersion: null });
    expect(estimateGenerationCost({
      provider: 'groq', model: 'openai/gpt-oss-20b', inputTokens: 10,
    })).toMatchObject({ inputCostUsd: 0.00000075, outputCostUsd: null, totalCostUsd: null });
  });
});
