import 'server-only';

import { embedText } from '@/lib/embeddings';
import { getServiceClient } from '@/lib/supabase';

export function buildSystemPrompt(context: string): string {
  return [
    'You are the virtual portfolio representation of Daniel Trindade.',
    'Answer in first person as Daniel when discussing professional experience,',
    'projects, skills, technical decisions, and career background.',
    'Use ONLY the context below. If the answer is not in the context, say you',
    "don't know rather than inventing facts.",
    'Do not imply that Daniel is present or replying in real time. If asked, explain',
    'that the response is generated from his professional portfolio documents.',
    'Answer in the same language as the question using concise, well-formatted Markdown.',
    '',
    '--- CONTEXT ---',
    context || '(no relevant context found)',
    '--- END CONTEXT ---',
  ].join('\n');
}

const envThreshold = Number(process.env.RAG_MATCH_THRESHOLD);
const DEFAULT_MATCH_THRESHOLD = Number.isFinite(envThreshold) ? envThreshold : 0.3;

const MAX_MATCH_COUNT = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type RetrievedRow = {
  content: string;
  metadata?: Record<string, unknown> | null;
};

export type RetrievedContext = {
  context: string;
  sources: Array<{ name: string; matchedChunks: number }>;
};

export function buildRetrievedContext(rows: RetrievedRow[]): RetrievedContext {
  const sourceCounts = new Map<string, number>();

  for (const row of rows) {
    const source = row.metadata?.['source'];
    if (typeof source !== 'string' || !source.trim()) continue;
    const name = source.trim();
    sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1);
  }

  return {
    context: rows.map((row) => row.content).join('\n\n---\n\n'),
    sources: Array.from(sourceCounts, ([name, matchedChunks]) => ({ name, matchedChunks })),
  };
}

export async function retrieveContext(
  query: string,
  opts: { matchCount?: number; matchThreshold?: number } = {},
): Promise<RetrievedContext> {
  if (!query.trim()) return { context: '', sources: [] };
  const matchCount = clamp(Math.trunc(opts.matchCount ?? 5), 1, MAX_MATCH_COUNT);
  const matchThreshold = clamp(opts.matchThreshold ?? DEFAULT_MATCH_THRESHOLD, 0, 1);
  const embedding = await embedText(query);
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });
  if (error) throw new Error(`match_documents failed: ${error.message}`);
  return buildRetrievedContext((data ?? []) as RetrievedRow[]);
}
