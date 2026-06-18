import { extractText } from '@/lib/extract';
import { chunkText } from '@/lib/chunk';
import { embedTexts } from '@/lib/embeddings';
import { getServiceClient } from '@/lib/supabase';

export const maxDuration = 60;

const ALLOWED = ['.pdf', '.md', '.txt'];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  if (req.headers.get('x-admin-token') !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!ALLOWED.some((ext) => lower.endsWith(ext))) {
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

  const embeddings = await embedTexts(chunks.map((c) => c.content));
  const rows = chunks.map((c, i) => ({
    content: c.content,
    embedding: embeddings[i],
    metadata: { source: file.name, chunk: c.index },
  }));

  const supabase = getServiceClient();
  const { error } = await supabase.from('documents').insert(rows);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ inserted: rows.length });
}
