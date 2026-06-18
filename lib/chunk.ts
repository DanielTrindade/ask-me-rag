export interface Chunk {
  content: string;
  index: number;
}

export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): Chunk[] {
  const size = opts.size ?? 2000;
  const overlap = opts.overlap ?? 200;
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks: Chunk[] = [];
  const step = Math.max(1, size - overlap);
  let index = 0;
  for (let start = 0; start < trimmed.length; start += step) {
    const content = trimmed.slice(start, start + size);
    chunks.push({ content, index: index++ });
    if (start + size >= trimmed.length) break;
  }
  return chunks;
}
