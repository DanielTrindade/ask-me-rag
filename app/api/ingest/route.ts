import { hasAdminSession } from '@/lib/admin-session';
import { extractText } from '@/lib/extract';
import { chunkText } from '@/lib/chunk';
import { embedTexts } from '@/lib/embeddings';
import { getServiceClient } from '@/lib/supabase';

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

  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  const rows = chunks.map((chunk, index) => ({
    content: chunk.content,
    embedding: embeddings[index],
    metadata: { source: file.name, chunk: chunk.index },
  }));

  const supabase = getServiceClient();
  const { error } = await supabase.from('documents').insert(rows);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ inserted: rows.length });
}
