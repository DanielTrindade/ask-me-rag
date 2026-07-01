export interface Chunk {
  content: string;
  index: number;
}

const PARAGRAPH_SPLIT = /\n\s*\n/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const WORD_SPLIT = /\s+/;

function codePoints(text: string): string[] {
  return Array.from(text);
}

function codePointLength(text: string): number {
  return codePoints(text).length;
}

function codePointSlice(text: string, start: number, length: number): string {
  return codePoints(text).slice(start, start + length).join('');
}

function splitRecursive(
  text: string,
  size: number,
  separators: RegExp[],
): string[] {
  if (codePointLength(text) <= size) return [text];
  const [separator, ...rest] = separators;
  if (!separator) {
    const pieces: string[] = [];
    const len = codePointLength(text);
    const step = Math.max(1, size);
    for (let start = 0; start < len; start += step) {
      pieces.push(codePointSlice(text, start, size));
      if (start + size >= len) break;
    }
    return pieces;
  }
  const parts = text.split(separator).filter((p) => p.length > 0);
  return parts.flatMap((part) => splitRecursive(part, size, rest));
}

function mergePieces(pieces: string[], size: number): string[] {
  const blocks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const sep = current ? '\n\n' : '';
    if (codePointLength(`${current}${sep}${piece}`) <= size) {
      current = `${current}${sep}${piece}`;
    } else {
      if (current) blocks.push(current);
      current = piece;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function applyOverlap(blocks: string[], size: number, overlap: number): string[] {
  if (overlap <= 0 || blocks.length <= 1) return blocks;
  const out: string[] = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    const prevPoints = codePoints(blocks[i - 1]);
    const tail = prevPoints.slice(Math.max(0, prevPoints.length - overlap)).join('');
    const combined = tail ? `${tail}\n\n${blocks[i]}` : blocks[i];
    const combinedPoints = codePoints(combined);
    out.push(combinedPoints.length > size ? combinedPoints.slice(0, size).join('') : combined);
  }
  return out;
}

export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): Chunk[] {
  const size = opts.size ?? 2000;
  const overlap = opts.overlap ?? 200;
  const trimmed = text.trim();
  if (!trimmed) return [];

  const pieces = splitRecursive(trimmed, size, [PARAGRAPH_SPLIT, SENTENCE_SPLIT, WORD_SPLIT]);
  const blocks = applyOverlap(mergePieces(pieces, size), size, overlap);

  return blocks.map((content, index) => ({ content, index }));
}