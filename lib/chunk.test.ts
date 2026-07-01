import { describe, it, expect } from 'vitest';
import { chunkText } from '@/lib/chunk';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('hello world');
    expect(chunks).toEqual([{ content: 'hello world', index: 0 }]);
  });

  it('splits long text into overlapping chunks', () => {
    const text = 'a'.repeat(2500);
    const chunks = chunkText(text, { size: 1000, overlap: 100 });
    expect(chunks.length).toBe(3);
    expect(chunks[0].content.length).toBe(1000);
    // overlap: chunk 1 starts 100 chars before chunk 0 ended
    expect(chunks[1].content[0]).toBe('a');
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('ignores empty/whitespace-only input', () => {
    expect(chunkText('   ')).toEqual([]);
  });

  it('keeps paragraphs together when they fit within size', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const chunks = chunkText(text, { size: 100, overlap: 0 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Paragraph one.');
    expect(chunks[0].content).toContain('Paragraph three.');
  });

  it('does not corrupt surrogate pairs (emoji) across chunk boundaries', () => {
    const emoji = '😀';
    const text = emoji.repeat(10);
    const chunks = chunkText(text, { size: 5, overlap: 0 });
    for (const piece of chunks.map((c) => c.content)) {
      expect(piece).not.toContain('\uFFFD');
    }
    const rejoined = chunks.map((c) => c.content).join('').replaceAll('\n\n', '');
    expect(rejoined.length).toBe(text.length);
  });
});
