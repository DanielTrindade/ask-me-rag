import { hasAdminSession } from '@/lib/admin-session';
import { getServiceClient } from '@/lib/supabase';

interface SourceRow {
  source: string;
  chunk_count: number;
  last_ingested_at: string | null;
}

export async function GET() {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('list_document_sources');

  if (error) {
    console.error('[/api/admin/documents] list failed:', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }

  const documents = ((data ?? []) as SourceRow[]).map((row) => ({
    source: row.source,
    chunkCount: row.chunk_count,
    lastIngestedAt: row.last_ingested_at,
  }));

  return Response.json({ documents });
}

export async function DELETE(req: Request) {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const source = new URL(req.url).searchParams.get('source')?.trim();
  if (!source) {
    return Response.json({ error: 'Missing source' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { error, count } = await supabase
    .from('documents')
    .delete({ count: 'exact' })
    .filter('metadata->>source', 'eq', source);

  if (error) {
    console.error('[/api/admin/documents] delete failed:', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }

  return Response.json({ deleted: count ?? 0 });
}
