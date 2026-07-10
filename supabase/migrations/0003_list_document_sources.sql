-- Migration 0003: list_document_sources() RPC for the admin document panel
--
-- Re-runnable (idempotent). Mirrors the function now present in
-- supabase/schema.sql so databases created before this change also get it.
-- The admin GET /api/admin/documents endpoint depends on this function.

create or replace function list_document_sources()
returns table (
  source text,
  chunk_count bigint,
  last_ingested_at timestamptz
)
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

insert into schema_migrations (name)
values ('0003_list_document_sources')
on conflict (name) do nothing;
