import { describe, expect, it } from 'vitest';
import {
  hasGroundedPortfolioContext,
  portfolioRefusal,
} from '@/lib/ai/portfolio-policy';

describe('portfolio policy', () => {
  it('exige contexto e ao menos uma fonte identificada', () => {
    expect(hasGroundedPortfolioContext({ context: '', sources: [] })).toBe(false);
    expect(hasGroundedPortfolioContext({
      context: 'Experiência profissional.',
      sources: [],
    })).toBe(false);
    expect(hasGroundedPortfolioContext({
      context: 'Experiência profissional.',
      sources: [{ name: 'cv.pdf', matchedChunks: 1 }],
    })).toBe(true);
  });

  it('retorna recusas específicas em português e inglês', () => {
    expect(portfolioRefusal('pt', 'out_of_scope')).toContain('trajetória profissional');
    expect(portfolioRefusal('pt', 'missing_evidence')).toContain('fontes profissionais');
    expect(portfolioRefusal('en', 'out_of_scope')).toContain('professional background');
    expect(portfolioRefusal('en', 'missing_evidence')).toContain('professional sources');
  });
});
