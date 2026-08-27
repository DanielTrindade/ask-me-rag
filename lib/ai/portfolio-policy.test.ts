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

  it('mantém as duas recusas distinguíveis entre si', () => {
    expect(portfolioRefusal('pt', 'missing_evidence')).not.toContain('trajetória profissional');
    expect(portfolioRefusal('pt', 'out_of_scope')).not.toContain('fontes profissionais');
  });

  it('declara o limite de domínio ao recusar por falta de evidência', () => {
    // Sem isso, "Quanto é 2 - 2?" recebe apenas "não encontrei essa informação",
    // insinuando que a conta estaria no portfólio se houvesse fonte.
    expect(portfolioRefusal('pt', 'missing_evidence')).toContain('minha carreira');
    expect(portfolioRefusal('en', 'missing_evidence')).toContain('my career');
  });
});
