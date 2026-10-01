import { describe, expect, it } from 'vitest';
import { detectContextReproduction } from '@/lib/ai/verbatim-guard';

/** Gera um trecho determinístico de `count` palavras únicas por prefixo. */
function chunk(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(' ');
}

const chunks = [chunk('alfa', 70), chunk('beta', 70), chunk('gama', 70)];

describe('detectContextReproduction', () => {
  it('detecta o despejo de todos os trechos', () => {
    const result = detectContextReproduction(chunks.join('\n\n---\n\n'), chunks);
    expect(result.reproduced).toBe(true);
    expect(result.contextCoverage).toBeGreaterThanOrEqual(0.5);
    expect(result.chunksWithLongRun).toBe(3);
  });

  it('detecta cópias longas de dois trechos', () => {
    const answer = `${chunk('alfa', 70)} Texto intermediário próprio. ${chunk('beta', 70)}`;
    const result = detectContextReproduction(answer, chunks);
    expect(result.chunksWithLongRun).toBe(2);
    expect(result.reproduced).toBe(true);
  });

  it('ignora pontuação e caixa na comparação', () => {
    const noisy = chunks.map((text) => text.toUpperCase().replaceAll(' ', ',  ')).join('\n');
    expect(detectContextReproduction(noisy, chunks).reproduced).toBe(true);
  });

  it('não dispara em resposta parafraseada', () => {
    const answer =
      'Trabalhei com mensageria e integrações de pagamento, cuidando de idempotência e ' +
      'reentrega de eventos, e também apoiei a evolução do frontend em React ao longo dos projetos.';
    const result = detectContextReproduction(answer, chunks);
    expect(result.reproduced).toBe(false);
    expect(result.copiedWords).toBe(0);
  });

  it('não dispara em uma citação curta', () => {
    const quote = chunk('alfa', 20).split(' ').slice(5, 20).join(' ');
    const answer = `Como descrevo no currículo: "${quote}". Foi um projeto importante para mim.`;
    const result = detectContextReproduction(answer, chunks);
    expect(result.reproduced).toBe(false);
    expect(result.chunksWithLongRun).toBe(0);
  });

  it('não dispara em cópia parcial de um único trecho longo', () => {
    const long = [chunk('delta', 400), chunk('epsilon', 400)];
    const result = detectContextReproduction(chunk('delta', 130), long);
    expect(result.copiedWords).toBeGreaterThanOrEqual(120);
    expect(result.contextCoverage).toBeLessThan(0.5);
    expect(result.chunksWithLongRun).toBe(1);
    expect(result.reproduced).toBe(false);
  });

  it('trata entradas vazias', () => {
    const empty = { reproduced: false, copiedWords: 0, contextCoverage: 0, chunksWithLongRun: 0 };
    expect(detectContextReproduction('', chunks)).toEqual(empty);
    expect(detectContextReproduction('texto qualquer', [])).toEqual(empty);
    expect(detectContextReproduction('curto', ['curto'])).toEqual(empty);
  });
});
