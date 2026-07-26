import 'server-only';

import type { SourceReference } from '@/lib/chat-types';
import { truncateTextToTokenBudget, estimateTextTokens } from '@/lib/ai/prompt-budget';
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
const DEFAULT_MATCH_COUNT = 3;
const MAX_MATCH_COUNT = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export type RetrievedRow = {
  content: string;
  similarity?: number;
  metadata?: Record<string, unknown> | null;
};

export type RetrievedContext = {
  context: string;
  sources: SourceReference[];
};

export function buildRetrievedContext(
  inputRows: RetrievedRow[],
  options: { maxChunks?: number; tokenBudget?: number } = {},
): RetrievedContext {
  const maxChunks = clamp(Math.trunc(options.maxChunks ?? DEFAULT_MATCH_COUNT), 1, MAX_MATCH_COUNT);
  const tokenBudget = Math.max(0, Math.trunc(options.tokenBudget ?? Number.MAX_SAFE_INTEGER));
  const rows = inputRows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const similarity = (right.row.similarity ?? 0) - (left.row.similarity ?? 0);
      return similarity === 0 ? left.index - right.index : similarity;
    })
    .slice(0, maxChunks);

  const included: RetrievedRow[] = [];
  let usedTokens = 0;
  for (const { row } of rows) {
    const separatorTokens = included.length > 0 ? estimateTextTokens('\n\n---\n\n') : 0;
    const remaining = tokenBudget - usedTokens - separatorTokens;
    if (remaining <= 0) break;
    const wasTruncated = estimateTextTokens(row.content) > remaining;
    const content = truncateTextToTokenBudget(row.content, remaining);
    if (!content) continue;
    included.push({ ...row, content });
    usedTokens += separatorTokens + estimateTextTokens(content);
    if (wasTruncated) break;
  }

  const sourceCounts = new Map<string, number>();
  for (const row of included) {
    const source = row.metadata?.['source'];
    if (typeof source !== 'string' || !source.trim()) continue;
    const name = source.trim();
    sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1);
  }

  return {
    context: included.map((row) => row.content).join('\n\n---\n\n'),
    sources: Array.from(sourceCounts, ([name, matchedChunks]) => ({ name, matchedChunks })),
  };
}

export async function retrieveContext(
  query: string,
  opts: {
    matchCount?: number;
    matchThreshold?: number;
    tokenBudget?: number;
  } = {},
): Promise<RetrievedContext> {
  if (!query.trim()) return { context: '', sources: [] };
  const matchCount = clamp(Math.trunc(opts.matchCount ?? DEFAULT_MATCH_COUNT), 1, MAX_MATCH_COUNT);
  const matchThreshold = clamp(opts.matchThreshold ?? DEFAULT_MATCH_THRESHOLD, 0, 1);
  const embedding = await embedText(query, 'query');
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });
  if (error) throw new Error('match_documents_failed');
  return buildRetrievedContext((data ?? []) as RetrievedRow[], {
    maxChunks: matchCount,
    tokenBudget: opts.tokenBudget,
  });
}
