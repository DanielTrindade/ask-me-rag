export interface Chunk {
  content: string;
  index: number;
}

const PARAGRAPH_SPLIT = /\n\s*\n/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const WORD_SPLIT = /\s+/;

type Sep = '' | '\n\n' | ' ';

interface Piece {
  text: string;
  /** Separator to insert when joining this piece to the previous piece of a block. */
  sep: Sep;
  points?: string[];
}

function codePoints(text: string): string[] {
  return Array.from(text);
}

function pieceLength(piece: Piece): number {
  if (!piece.points) piece.points = codePoints(piece.text);
  return piece.points.length;
}

function splitRecursive(
  text: string,
  size: number,
  separators: RegExp[],
  parentSep: Sep,
): Piece[] {
  const points = codePoints(text);
  if (points.length <= size) return [{ text, sep: parentSep, points }];

  const [separator, ...rest] = separators;
  if (!separator) {
    // No further separator to honor: hard codepoint-safe slice fallback.
    const pieces: Piece[] = [];
    const step = Math.max(1, size);
    for (let start = 0; start < points.length; start += step) {
      pieces.push({ text: points.slice(start, start + size).join(''), sep: parentSep });
      if (start + size >= points.length) break;
    }
    return pieces;
  }

  const thisSep: Sep = separator === PARAGRAPH_SPLIT ? '\n\n' : ' ';
  const parts = text.split(separator).filter((p) => p.length > 0);

  const result: Piece[] = [];
  parts.forEach((part, i) => {
    // The first piece inside this split inherits the joiner to the outer
    // predecessor; subsequent pieces join to their sibling via this level's sep.
    const childSep = i === 0 ? parentSep : thisSep;
    result.push(...splitRecursive(part, size, rest, childSep));
  });
  return result;
}

function mergePieces(pieces: Piece[], size: number): string[] {
  const blocks: string[] = [];
  let current = '';
  let currentLen = 0;

  for (const piece of pieces) {
    const sep = current ? piece.sep : '';
    const pieceLen = pieceLength(piece);
    if (currentLen + sep.length + pieceLen <= size) {
      current = `${current}${sep}${piece.text}`;
      currentLen += sep.length + pieceLen;
    } else {
      if (current) blocks.push(current);
      current = piece.text;
      currentLen = pieceLen;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/** Truncate `block` to fit within `limit` codepoints while keeping a safe seam. */
function fitBlockSafely(block: string, limit: number): string {
  const points = codePoints(block);
  if (limit <= 0) return '';
  if (points.length <= limit) return block;

  const limited = points.slice(0, limit);

  let cut = -1;
  // 1. last paragraph break
  for (let i = limited.length - 2; i >= 0; i--) {
    if (limited[i] === '\n' && limited[i + 1] === '\n') {
      cut = i + 2;
      break;
    }
  }
  // 2. last end-of-sentence (punctuation followed by whitespace)
  if (cut === -1) {
    for (let i = limited.length - 2; i >= 0; i--) {
      if (/[.!?]/.test(limited[i]) && /\s/.test(limited[i + 1])) {
        cut = i + 1;
        break;
      }
    }
  }
  // 3. last whitespace
  if (cut === -1) {
    for (let i = limited.length - 1; i >= 0; i--) {
      if (/\s/.test(limited[i])) {
        cut = i + 1;
        break;
      }
    }
  }
  // 4. pathological: single token longer than limit — hard slice
  if (cut <= 0) return limited.join('');
  return points.slice(0, cut).join('');
}

function applyOverlap(blocks: string[], size: number, overlap: number): string[] {
  if (overlap <= 0 || blocks.length <= 1) return blocks;
  const out: string[] = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    const prevPoints = codePoints(blocks[i - 1]);
    const tail = prevPoints.slice(Math.max(0, prevPoints.length - overlap)).join('');
    if (!tail) {
      out.push(blocks[i]);
      continue;
    }
    const sep = '\n\n';
    const prefix = `${tail}${sep}`;
    const remaining = size - prefix.length;
    const truncated = remaining <= 0 ? '' : fitBlockSafely(blocks[i], remaining);
    out.push(`${prefix}${truncated}`);
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

  const pieces = splitRecursive(trimmed, size, [PARAGRAPH_SPLIT, SENTENCE_SPLIT, WORD_SPLIT], '');
  const blocks = applyOverlap(mergePieces(pieces, size), size, overlap);

  return blocks.map((content, index) => ({ content, index }));
}