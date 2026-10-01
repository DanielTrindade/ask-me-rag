import 'server-only';

/**
 * Backstop determinístico da saída (R2-1): detecta quando a resposta despeja os
 * trechos recuperados em vez de responder com as próprias palavras. Independe
 * do Jev: compara shingles de palavras entre a resposta e o contexto. Citações
 * curtas e paráfrases não chegam perto dos limiares abaixo.
 */

/** Tamanho (em palavras) do shingle usado na comparação. */
export const SHINGLE_WORDS = 8;
/** Sequência contínua copiada de um mesmo trecho que conta como "cópia longa". */
export const LONG_RUN_WORDS = 40;
/** Mínimo de palavras da resposta cobertas por shingles do contexto. */
export const MIN_COPIED_WORDS = 120;
/** Fração mínima dos shingles do contexto presentes na resposta (dump amplo). */
export const MIN_CONTEXT_COVERAGE = 0.5;
/** Mínimo de trechos distintos com cópia longa (dump de vários trechos). */
export const MIN_CHUNKS_WITH_LONG_RUN = 2;

export type ContextReproduction = {
  reproduced: boolean;
  copiedWords: number;
  contextCoverage: number;
  chunksWithLongRun: number;
};

function toWords(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function shinglesOf(words: readonly string[]): string[] {
  const shingles: string[] = [];
  for (let index = 0; index + SHINGLE_WORDS <= words.length; index += 1) {
    shingles.push(words.slice(index, index + SHINGLE_WORDS).join(' '));
  }
  return shingles;
}

/** Maior sequência de shingles consecutivos da resposta presentes no conjunto. */
function longestRunWords(answerShingles: readonly string[], chunkShingles: ReadonlySet<string>) {
  let best = 0;
  let current = 0;
  for (const shingle of answerShingles) {
    current = chunkShingles.has(shingle) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  // k shingles consecutivos cobrem k + SHINGLE_WORDS - 1 palavras.
  return best === 0 ? 0 : best + SHINGLE_WORDS - 1;
}

export function detectContextReproduction(
  answer: string,
  chunks: readonly string[],
): ContextReproduction {
  const none: ContextReproduction = {
    reproduced: false,
    copiedWords: 0,
    contextCoverage: 0,
    chunksWithLongRun: 0,
  };
  const answerWords = toWords(answer);
  const answerShingles = shinglesOf(answerWords);
  const chunkShingleSets = chunks.map((chunk) => new Set(shinglesOf(toWords(chunk))));
  const contextShingles = new Set(chunkShingleSets.flatMap((set) => [...set]));
  if (answerShingles.length === 0 || contextShingles.size === 0) return none;

  const covered = new Array<boolean>(answerWords.length).fill(false);
  const answerShingleSet = new Set(answerShingles);
  answerShingles.forEach((shingle, index) => {
    if (!contextShingles.has(shingle)) return;
    for (let offset = 0; offset < SHINGLE_WORDS; offset += 1) covered[index + offset] = true;
  });
  const copiedWords = covered.filter(Boolean).length;

  let present = 0;
  for (const shingle of contextShingles) if (answerShingleSet.has(shingle)) present += 1;
  const contextCoverage = present / contextShingles.size;

  const chunksWithLongRun = chunkShingleSets.filter(
    (set) => set.size > 0 && longestRunWords(answerShingles, set) >= LONG_RUN_WORDS,
  ).length;

  return {
    reproduced:
      copiedWords >= MIN_COPIED_WORDS &&
      (contextCoverage >= MIN_CONTEXT_COVERAGE || chunksWithLongRun >= MIN_CHUNKS_WITH_LONG_RUN),
    copiedWords,
    contextCoverage,
    chunksWithLongRun,
  };
}
