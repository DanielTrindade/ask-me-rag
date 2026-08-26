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
  const fresh: FreshChunk[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const hash = sha256(`${source}::${chunk.content}`);
    if (!existingHashes.has(hash)) {
      fresh.push({ chunk, index, hash });
    }
  }
  return fresh;
}