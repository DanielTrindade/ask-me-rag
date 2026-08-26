import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { buildRetrievedContext, buildSystemPrompt, retrieveContext } from '@/lib/rag';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

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
      { content: 'menos relevante', rank: 0.1, metadata: { source: 'omitido.md' } },
      { content: 'mais relevante', rank: 0.9, metadata: { source: 'a.md' } },
      { content: 'relevante dois', rank: 0.8, metadata: { source: 'b.md' } },
      { content: 'relevante três', rank: 0.7, metadata: { source: 'c.md' } },
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
        rank: 0.9,
        metadata: { source: 'incluida.md' },
      },
      { content: 'não deve caber', rank: 0.8, metadata: { source: 'omitida.md' } },
    ], { tokenBudget: 20 });
    expect(result.context).toMatch(/[.!?]$/);
    expect(result.sources).toEqual([{ name: 'incluida.md', matchedChunks: 1 }]);
  });

});

describe('retrieveContext', () => {
  it('retorna vazio sem consultar o banco quando a pergunta está vazia', async () => {
    await expect(retrieveContext('   ')).resolves.toEqual({ context: '', sources: [] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('consulta o FTS em português por padrão e preserva as fontes', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        content: 'Experiência com pagamentos.',
        rank: 0.8,
        metadata: { source: 'cv.md' },
      }],
      error: null,
    });

    await expect(retrieveContext('experiencia pagamentos')).resolves.toEqual({
      context: 'Experiência com pagamentos.',
      sources: [{ name: 'cv.md', matchedChunks: 1 }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith('search_documents', {
      query_text: 'experiencia pagamentos',
      query_language: 'portuguese',
      match_count: 3,
    });
  });

  it('mapeia locale inglês e limita a quantidade de chunks', async () => {
    await retrieveContext('payment platforms', { language: 'en', matchCount: 99 });

    expect(mocks.rpc).toHaveBeenCalledWith('search_documents', {
      query_text: 'payment platforms',
      query_language: 'english',
      match_count: 8,
    });
  });

  it('converte falha do RPC em erro sanitizado', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'detalhe privado do banco' },
    });

    await expect(retrieveContext('projetos')).rejects.toThrow('search_documents_failed');
  });
});
