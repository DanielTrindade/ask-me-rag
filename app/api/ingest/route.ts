import { hasAdminSession } from '@/lib/admin-session';
import { extractText } from '@/lib/extract';
import { chunkText } from '@/lib/chunk';
import { embedTexts } from '@/lib/embeddings';
import { getServiceClient } from '@/lib/supabase';
import { sha256 } from '@/lib/hash';

export const maxDuration = 60;

const ALLOWED = ['.pdf', '.md', '.txt'];
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  const lower = file.name.toLowerCase();
  if (!ALLOWED.some((extension) => lower.endsWith(extension))) {
    return Response.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const text = await extractText(file);
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return Response.json({ error: 'No text extracted' }, { status: 422 });
  }

  const supabase = getServiceClient();
  const source = file.name;
  const hashes = chunks.map((chunk) => sha256(`${source}::${chunk.content}`));

  const { data: existing } = await supabase
    .from('documents')
    .select('metadata')
    .filter('metadata->>source', 'eq', source);

  const existingHashes = new Set(
    (existing ?? [])
      .map((row) => row?.metadata?.['chunk_hash'])
      .filter(Boolean),
  );
  const fresh = chunks
    .map((chunk, index) => ({ chunk, index, hash: hashes[index] }))
    .filter((entry) => !existingHashes.has(entry.hash));

  if (fresh.length === 0) {
    return Response.json({ inserted: 0, skipped: chunks.length });
  }

  const embeddings = await embedTexts(fresh.map((entry) => entry.chunk.content));
  const rows = fresh.map((entry, i) => ({
    content: entry.chunk.content,
    embedding: embeddings[i],
    metadata: {
      source,
      chunk: entry.chunk.index,
      chunk_hash: entry.hash,
    },
  }));

  const { error } = await supabase.from('documents').insert(rows);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ inserted: rows.length, skipped: chunks.length - rows.length });
}
