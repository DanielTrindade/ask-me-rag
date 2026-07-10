# Admin Document Management — Design

**Date:** 2026-07-09
**Status:** Approved (RPC listing approach)

## Purpose

Let the admin see which files are indexed in the knowledge base and delete a
file — removing all of its chunks and embeddings — without opening Supabase.
Motivating case: replacing an already-ingested PDF résumé with a Markdown
version that contains explicit URLs.

## Scope

- List indexed documents grouped by `source` (file name), with chunk count and
  most recent ingestion date.
- Delete a document by `source`: removes every `documents` row whose
  `metadata->>'source'` matches. Chunks and embeddings live in the same table,
  so one delete removes both.
- Out of scope (YAGNI): soft delete / undo, renaming, re-indexing, per-chunk
  management, pagination (the base is small; revisit if it grows).

## Architecture

### Database — `list_document_sources()` RPC

New SQL function appended to `supabase/schema.sql`, following the existing
`match_documents` pattern (re-runnable `create or replace`):

```sql
create or replace function list_document_sources()
returns table (source text, chunk_count bigint, last_ingested_at timestamptz)
language sql stable
as $$
  select
    documents.metadata->>'source' as source,
    count(*) as chunk_count,
    max(documents.created_at) as last_ingested_at
  from documents
  group by 1
  order by 3 desc;
$$;
```

Must be run once against the Supabase project (SQL Editor), same as previous
schema changes.

### API — `app/api/admin/documents/route.ts`

Both handlers guard with `hasAdminSession()` and return `401` otherwise,
mirroring `/api/ingest`. Both use `getServiceClient()`.

- **GET** — calls `supabase.rpc('list_document_sources')`; responds
  `{ documents: [{ source, chunkCount, lastIngestedAt }] }`. On RPC error:
  log + `500 { error: 'internal_error' }`.
- **DELETE** — reads `source` from the query string. Empty/missing source →
  `400`. Deletes via
  `supabase.from('documents').delete().filter('metadata->>source', 'eq', source)`
  (same filter idiom as the ingest dedup query) and responds
  `{ deleted: <count> }`. Unknown source deletes 0 rows and is still a `200`
  (idempotent). On error: log + `500`.

### UI — `components/admin/document-list.tsx` (client component)

New card **“Documentos indexados”** rendered in `app/admin/page.tsx` inside the
existing `admin-grid`, alongside the upload form.

- Fetches `GET /api/admin/documents` on mount; on `401` redirects to
  `/admin/login` (same pattern as `UploadForm`).
- Each row: file name, chunk count, last ingestion date, delete button.
- Delete requires an inline confirmation step (button → “Confirmar exclusão?”)
  before calling the DELETE endpoint; row shows a loading state while pending.
- After a successful delete: toast + refetch list.
- After a successful upload: list refetches. `UploadForm` and `DocumentList`
  coordinate via a shared refresh signal owned by a small client wrapper (e.g.
  a `refreshKey` state lifted to a parent client component), keeping
  `admin/page.tsx` a server component.
- Empty state: short “Nenhum documento indexado ainda.” text.
- Built with Astryx components (`Card`, `VStack`, `HStack`, `Text`, `Button`,
  `Heading`), tokens only — consistent with the rest of the admin.
- All new strings added to `lib/i18n.ts` in both `pt` and `en`.

## Error handling

- API: `401` unauthenticated, `400` missing source, `500` with generic
  `internal_error` body (details only in server logs) — same conventions as
  existing routes.
- UI: fetch/delete failures surface via toast using a new
  `admin.documentsError`-style i18n key; list keeps last known good state.

## Testing

- Unit tests are the project norm (`lib/*.test.ts`) and the new logic is thin
  I/O glue; the meaningful coverage is route-level:
  - GET/DELETE return 401 without a session.
  - DELETE returns 400 without `source`.
  - DELETE builds the correct `metadata->>source` filter (mocked Supabase
    client).
- Manual verification: upload a file, see it listed, delete it, confirm the
  chunks are gone (list empties and chat no longer retrieves the content).
