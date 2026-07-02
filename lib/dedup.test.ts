import { describe, it, expect } from 'vitest';
import { selectFresh } from '@/lib/dedup';
import type { Chunk } from '@/lib/chunk';
import { sha256 } from '@/lib/hash';

const source = 'doc.txt';
const mkChunks = (contents: string[]): Chunk[] =>
  contents.map((content, index) => ({ content, index }));

describe('selectFresh', () => {
  it('returns every chunk when there are no existing hashes', () => {
    const chunks = mkChunks(['a', 'b', 'c']);
    const fresh = selectFresh(new Set(), chunks, source);
    expect(fresh.map((f) => f.chunk.content)).toEqual(['a', 'b', 'c']);
    expect(fresh.map((f) => f.index)).toEqual([0, 1, 2]);
  });

  it('returns no chunks when all hashes already exist', () => {
    const chunks = mkChunks(['a', 'b']);
    const existing = new Set(chunks.map((c) => sha256(`${source}::${c.content}`)));
    const fresh = selectFresh(existing, chunks, source);
    expect(fresh).toEqual([]);
  });

  it('returns only the novel chunks on partial overlap', () => {
    const chunks = mkChunks(['a', 'b', 'c']);
    const existing = new Set([sha256(`${source}::a`), sha256(`${source}::c`)]);
    const fresh = selectFresh(existing, chunks, source);
    expect(fresh.map((f) => f.chunk.content)).toEqual(['b']);
    expect(fresh[0].index).toBe(1);
  });

  it('produces stable, deterministic hashes across calls', () => {
    const chunks = mkChunks(['x', 'y']);
    const first = selectFresh(new Set(), chunks, source);
    const second = selectFresh(new Set(), chunks, source);
    expect(first.map((f) => f.hash)).toEqual(second.map((f) => f.hash));
    expect(first[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is sensitive to the source in the hash formula', () => {
    const chunks = mkChunks(['shared']);
    const freshSame = selectFresh(
      new Set([sha256(`${source}::shared`)]),
      chunks,
      source,
    );
    const freshOther = selectFresh(
      new Set([sha256(`${source}::shared`)]),
      chunks,
      'other.txt',
    );
    expect(freshSame).toEqual([]);
    expect(freshOther.map((f) => f.chunk.content)).toEqual(['shared']);
  });
});