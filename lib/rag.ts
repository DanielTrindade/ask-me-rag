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

export async function retrieveContext(
  query: string,
  opts: { matchCount?: number } = {},
): Promise<string> {
  if (!query.trim()) return '';
  const embedding = await embedText(query);
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_count: opts.matchCount ?? 5,
    match_threshold: 0.3,
  });
  if (error) throw new Error(`match_documents failed: ${error.message}`);
  return (data ?? [])
    .map((row: { content: string }) => row.content)
    .join('\n\n---\n\n');
}
