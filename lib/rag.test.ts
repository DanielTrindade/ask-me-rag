import { describe, it, expect } from 'vitest';
import { buildRetrievedContext, buildSystemPrompt } from '@/lib/rag';

describe('buildSystemPrompt', () => {
  it('includes the provided context', () => {
    const prompt = buildSystemPrompt('Daniel worked at ACME.');
    expect(prompt).toContain('Daniel worked at ACME.');
  });

  it('instructs the model not to invent answers', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt.toLowerCase()).toContain("don't know");
  });

  it('instructs the model to answer as Daniel in first person', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt).toContain('Answer in first person as Daniel');
    expect(prompt).toContain('Do not imply that Daniel is present');
  });
});


describe('buildRetrievedContext', () => {
  it('returns context and deduplicated source counts', () => {
    const result = buildRetrievedContext([
      { content: 'Experiência na ACME.', metadata: { source: 'cv.pdf' } },
      { content: 'Projeto de pagamentos.', metadata: { source: 'cv.pdf' } },
      { content: 'Decisão arquitetural.', metadata: { source: 'projetos.md' } },
    ]);

    expect(result.context).toContain('Experiência na ACME.');
    expect(result.sources).toEqual([
      { name: 'cv.pdf', matchedChunks: 2 },
      { name: 'projetos.md', matchedChunks: 1 },
    ]);
  });

  it('ordena por relevância, limita três chunks e referencia apenas os incluídos', () => {
    const result = buildRetrievedContext([
      { content: 'menos relevante', similarity: 0.1, metadata: { source: 'omitido.md' } },
      { content: 'mais relevante', similarity: 0.9, metadata: { source: 'a.md' } },
      { content: 'relevante dois', similarity: 0.8, metadata: { source: 'b.md' } },
      { content: 'relevante três', similarity: 0.7, metadata: { source: 'c.md' } },
    ]);
    expect(result.context).toContain('mais relevante');
    expect(result.context).not.toContain('menos relevante');
    expect(result.sources).toEqual([
      { name: 'a.md', matchedChunks: 1 },
      { name: 'b.md', matchedChunks: 1 },
      { name: 'c.md', matchedChunks: 1 },
    ]);
  });

  it('trunca o contexto no teto e omite fontes sem conteúdo incluído', () => {
    const result = buildRetrievedContext([
      {
        content: 'Primeira frase completa. Segunda frase extensa '.repeat(30),
        similarity: 0.9,
        metadata: { source: 'incluida.md' },
      },
      { content: 'não deve caber', similarity: 0.8, metadata: { source: 'omitida.md' } },
    ], { tokenBudget: 20 });
    expect(result.context).toMatch(/[.!?]$/);
    expect(result.sources).toEqual([{ name: 'incluida.md', matchedChunks: 1 }]);
  });

});
