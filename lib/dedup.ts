import type { Chunk } from '@/lib/chunk';
import { sha256 } from '@/lib/hash';

export interface FreshChunk {
  chunk: Chunk;
  index: number;
  hash: string;
}

/**
 * Pure, DB-free helper that selects the chunks whose (source::content) hash
 * is NOT present in `existingHashes`. Hashes are computed deterministically as
 * `sha256(source + '::' + chunk.content)`, mirroring the SQL backfill.
 */
export function selectFresh(
  existingHashes: Set<string>,
  chunks: Chunk[],
  source: string,
): FreshChunk[] {
  return chunks
    .map((chunk, index) => ({
      chunk,
      index,
      hash: sha256(`${source}::${chunk.content}`),
    }))
    .filter((entry) => !existingHashes.has(entry.hash));
}